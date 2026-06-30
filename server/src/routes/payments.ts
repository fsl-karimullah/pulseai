import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../config/supabase';
// @ts-ignore
import midtransClient from 'midtrans-client';

import { authenticate } from '../middleware/auth';
import { findPartnerByCode, logReferralCommission } from '../services/referralService';

export default async function paymentsRoutes(fastify: FastifyInstance) {
  fastify.post('/payments/create-transaction', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { plan, amount, userEmail, referral_code } = request.body as {
        plan: string;
        amount: number;
        userEmail: string;
        referral_code?: string;
      };

      if (!plan || !amount) {
        return reply.status(400).send({ success: false, message: 'Missing plan or amount' });
      }

      // Initialize Snap client
      let snap = new midtransClient.Snap({
        isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
        serverKey: process.env.MIDTRANS_SERVER_KEY || '',
        clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
      });

      // 1. Fetch user's organization
      const userId = (request as any).user?.id;
      
      if (!userId) {
        return reply.status(401).send({ success: false, message: 'Unauthorized' });
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      let targetOrgId = org?.id;

      // Final Fallback: Auto-create an organization if the table is totally empty (Dev only)
      if (!targetOrgId) {
        console.log('Creating default organization for development...');
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({ user_id: userId, name: 'Default Organization' })
          .select()
          .single();
        
        if (newOrg) {
          targetOrgId = newOrg.id;
          // Also create a subscription for it
          await supabase.from('subscriptions').insert({ org_id: targetOrgId, plan_type: 'free' });
        } else {
          console.error('Failed to auto-create organization:', orgError);
        }
      }

      if (!targetOrgId) {
        return reply.status(404).send({ 
          success: false, 
          message: 'No organization found and auto-creation failed. Please sign up first.' 
        });
      }

      const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // ── Referral / Kupon: Validate code and compute discounted amount ──────
      let finalAmount = amount;          // amount user will actually pay
      let referralPartnerId: string | null = null;

      if (referral_code && referral_code.trim()) {
        try {
          const partner = await findPartnerByCode(referral_code);
          if (partner) {
            // Apply discount: finalAmount = originalPrice * (1 - discount_rate)
            finalAmount = Math.round(amount * (1 - partner.discount_rate));
            referralPartnerId = partner.id;
            fastify.log.info(
              { code: referral_code, partnerId: partner.id, originalAmount: amount, finalAmount },
              '[Payment] Referral discount applied'
            );
          } else {
            // Invalid code — do NOT block checkout, simply ignore the discount
            fastify.log.warn({ referral_code }, '[Payment] Referral code not found — ignoring');
          }
        } catch (refErr: any) {
          // Non-fatal: if the referral lookup fails, proceed at full price
          fastify.log.error({ err: refErr.message }, '[Payment] Referral lookup error — proceeding at full price');
        }
      }

      // 2. Save Pending Order to DB (include partner_id so the webhook can log commission)
      await supabase.from('payment_orders').insert({
        order_id:          orderId,
        org_id:            targetOrgId,
        plan_type:         plan,
        amount:            finalAmount,       // discounted amount stored for Midtrans
        original_amount:   amount,            // original price before discount
        referral_partner_id: referralPartnerId, // null when no valid code was used
        status:            'pending',
      });

      // Prepare Midtrans Transaction parameter
      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: finalAmount,   // ← discounted amount sent to payment gateway
        },
        item_details: [
          {
            id: plan,
            price: finalAmount,
            quantity: 1,
            name: `PulseAI ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan${
              referralPartnerId ? ` (Kode Referral: ${referral_code?.toUpperCase()})` : ''
            }`,
          },
        ],
        customer_details: {
          email: userEmail || 'customer@example.com',
          first_name: 'PulseAI',
          last_name: 'Customer',
        },
        credit_card: {
          secure: true,
        },
        callbacks: {
          finish: "http://localhost:5173/billing"
        }
      };

      // Create transaction token
      const transaction = await snap.createTransaction(parameter);

      return reply.send({
        success: true,
        token:        transaction.token,
        redirect_url: transaction.redirect_url,
        // Echo back discount info so the frontend can display it
        discount_applied: referralPartnerId !== null,
        original_amount:  amount,
        final_amount:     finalAmount,
      });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to create Midtrans transaction');
      return reply.status(500).send({
        success: false,
        message: 'Payment generation failed',
        error: error.message,
      });
    }
  });

  fastify.post('/payments/notification', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const notification = request.body as any;
      
      const transactionStatus = notification.transaction_status;
      const fraudStatus = notification.fraud_status;
      const orderId = notification.order_id;

      fastify.log.info(`Payment Notification received: ${orderId} - ${transactionStatus}`);

      if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
        if (fraudStatus === 'challenge') {
          // Handle challenge
          await supabase.from('payment_orders').update({ status: 'challenge' }).eq('order_id', orderId);
        } else {
          // Success!
          // 1. Update Order Status
          const { data: order } = await supabase
            .from('payment_orders')
            .update({ status: 'settled' })
            .eq('order_id', orderId)
            .select()
            .single();

          if (order) {
            // Calculate expiration and pdf limits based on plan
            // NOTE: Subscribers get unlimited chat (no credit deduction).
            //       Credits are only for FREE users (chat) and extra CV scans.
            const expirationDate = new Date();
            let newLimit = 999999; // unlimited chat for all paid plans
            let pdfUploadLimit = 3;

            if (order.plan_type === 'starter') {
              expirationDate.setMonth(expirationDate.getMonth() + 1);
              pdfUploadLimit = 10;
            } else if (order.plan_type === 'pro') {
              expirationDate.setMonth(expirationDate.getMonth() + 3);
              pdfUploadLimit = 20;
            } else if (order.plan_type === 'full_scale') {
              expirationDate.setFullYear(expirationDate.getFullYear() + 1);
              pdfUploadLimit = 30;
            } else {
              // Legacy plans fallback
              const isAnnual = order.plan_type.includes('annual');
              if (isAnnual) {
                expirationDate.setFullYear(expirationDate.getFullYear() + 1);
              } else {
                expirationDate.setMonth(expirationDate.getMonth() + 1);
              }
              newLimit = order.plan_type.includes('business') ? 3000 : 2000;
            }

            // Update subscription — DO NOT modify credits (handled separately via top-up)
            await supabase
              .from('subscriptions')
              .update({ 
                plan_type:        order.plan_type,
                chat_limit:       newLimit,
                status:           'active',
                expires_at:       expirationDate.toISOString(),
                pdf_upload_limit: pdfUploadLimit,
              })
              .eq('org_id', order.org_id);
              
            fastify.log.info(`Successfully upgraded Org ${order.org_id} to ${order.plan_type} — expires ${expirationDate.toISOString()}`);

            // ── Referral Commission Logging ────────────────────────────────
            // If this order used a referral code, look up the partner's current
            // commission_rate and log the earned commission. Non-fatal: payment
            // success must not be rolled back if this step fails.
            if (order.referral_partner_id) {
              try {
                const { data: partner } = await supabase
                  .from('referral_partners')
                  .select('commission_rate')
                  .eq('id', order.referral_partner_id)
                  .maybeSingle();

                if (partner) {
                  // Use original_amount (pre-discount) as the commission base so
                  // the partner is rewarded on the full package value.
                  const commissionBase = Number(order.original_amount ?? order.amount);
                  await logReferralCommission({
                    partnerId:      order.referral_partner_id,
                    buyerTenantId:  order.org_id,
                    packagePrice:   commissionBase,
                    commissionRate: Number(partner.commission_rate),
                  });
                  fastify.log.info(
                    { orderId, partnerId: order.referral_partner_id, commissionBase },
                    '[Referral] Commission logged successfully'
                  );
                }
              } catch (commErr: any) {
                // Log but do NOT re-throw — payment is already settled
                fastify.log.error(
                  { err: commErr.message, orderId, partnerId: order.referral_partner_id },
                  '[Referral] Failed to log commission (non-fatal)'
                );
              }
            }
            // ──────────────────────────────────────────────────────────────
          }
        }
      } else if (transactionStatus === 'deny' || transactionStatus === 'cancel' || transactionStatus === 'expire') {
        await supabase.from('payment_orders').update({ status: 'failed' }).eq('order_id', orderId);
      }

      return reply.send({ status: 'ok' });
    } catch (error: any) {
      fastify.log.error(error, 'Webhook error');
      return reply.status(500).send({ success: false });
    }
  });

  fastify.get('/payments/verify/:orderId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orderId } = request.params as { orderId: string };
      
      // Initialize Snap client
      let snap = new midtransClient.Snap({
        isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
        serverKey: process.env.MIDTRANS_SERVER_KEY || '',
        clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
      });

      // Check status from Midtrans
      const statusResponse = await snap.transaction.status(orderId);
      const transactionStatus = statusResponse.transaction_status;
      
      if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
        // Success!
        const { data: order } = await supabase
          .from('payment_orders')
          .update({ status: 'settled' })
          .eq('order_id', orderId)
          .select()
          .single();

        if (order) {
          const expirationDate = new Date();
          let newLimit = 100;
          let creditsToAdd = 0;
          let pdfUploadLimit = 3;

          if (order.plan_type === 'starter') {
            expirationDate.setMonth(expirationDate.getMonth() + 1);
            newLimit = 999999;
            creditsToAdd = 750;
            pdfUploadLimit = 10;
          } else if (order.plan_type === 'pro') {
            expirationDate.setMonth(expirationDate.getMonth() + 3);
            newLimit = 999999;
            creditsToAdd = 2250;
            pdfUploadLimit = 20;
          } else if (order.plan_type === 'full_scale') {
            expirationDate.setFullYear(expirationDate.getFullYear() + 1);
            newLimit = 999999;
            creditsToAdd = 9000;
            pdfUploadLimit = 30;
          } else {
            const isAnnual = order.plan_type.includes('annual');
            if (isAnnual) {
              expirationDate.setFullYear(expirationDate.getFullYear() + 1);
            } else {
              expirationDate.setMonth(expirationDate.getMonth() + 1);
            }
            newLimit = order.plan_type.includes('business') ? 3000 : 2000;
          }

          // Fetch current credits
          const { data: currentSub } = await supabase
            .from('subscriptions')
            .select('credits')
            .eq('org_id', order.org_id)
            .maybeSingle();
          const currentCredits = currentSub?.credits ?? 0;

          await supabase
            .from('subscriptions')
            .update({ 
              plan_type: order.plan_type,
              chat_limit: newLimit,
              status: 'active',
              expires_at: expirationDate.toISOString(),
              credits: currentCredits + creditsToAdd,
              pdf_upload_limit: pdfUploadLimit,
            })
            .eq('org_id', order.org_id);

          // Log credit transaction
          if (creditsToAdd > 0) {
            await supabase.from('credit_transactions').insert({
              org_id: order.org_id,
              amount: creditsToAdd,
              type: 'subscription',
              description: `Kredit paket ${order.plan_type} (${creditsToAdd} credits)`,
              reference: orderId,
            });
          }
            
          return reply.send({ success: true, message: 'Payment verified and account upgraded.' });
        }
      }

      return reply.send({ 
        success: false, 
        message: `Payment status is ${transactionStatus}. Please try again once settled.` 
      });
    } catch (error: any) {
      fastify.log.error(error, 'Manual verification error');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TOP-UP KREDIT ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /payments/create-topup
   * Buat transaksi Midtrans untuk top-up kredit.
   * Body: { credits: number } — jumlah kredit yang ingin dibeli.
   * Harga: 100 kredit = Rp 10.000 (minimum 10 kredit)
   */
  fastify.post('/payments/create-topup', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { credits, userEmail } = request.body as {
        credits: number;
        userEmail?: string;
      };

      if (!credits || credits < 10) {
        return reply.status(400).send({ success: false, message: 'Minimal pembelian adalah 10 kredit.' });
      }

      if (credits > 1000000) {
        return reply.status(400).send({ success: false, message: 'Maksimal pembelian adalah 1.000.000 kredit.' });
      }

      // Hitung harga: 100 kredit = Rp 10.000
      const amount = Math.ceil(credits / 100) * 10000;

      const userId = (request as any).user?.id;
      if (!userId) {
        return reply.status(401).send({ success: false, message: 'Unauthorized' });
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!org?.id) {
        return reply.status(404).send({ success: false, message: 'Organisasi tidak ditemukan.' });
      }

      let snap = new midtransClient.Snap({
        isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
        serverKey: process.env.MIDTRANS_SERVER_KEY || '',
        clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
      });

      const orderId = `TOPUP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Simpan top-up order ke DB
      await supabase.from('credit_topups').insert({
        order_id: orderId,
        org_id: org.id,
        credits_purchased: credits,
        amount,
        status: 'pending',
      });

      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        item_details: [
          {
            id: 'credit_topup',
            price: amount,
            quantity: 1,
            name: `Top-Up ${credits.toLocaleString('id-ID')} Kredit PulseAI`,
          },
        ],
        customer_details: {
          email: userEmail || 'customer@example.com',
          first_name: 'PulseAI',
          last_name: 'Customer',
        },
        credit_card: { secure: true },
        callbacks: { finish: 'http://localhost:5173/billing' },
      };

      const transaction = await snap.createTransaction(parameter);

      return reply.send({
        success: true,
        token: transaction.token,
        redirect_url: transaction.redirect_url,
        credits,
        amount,
      });
    } catch (error: any) {
      fastify.log.error(error, 'Failed to create top-up transaction');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  /**
   * POST /payments/topup-notification
   * Midtrans webhook untuk konfirmasi top-up kredit.
   */
  fastify.post('/payments/topup-notification', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const notification = request.body as any;
      const { transaction_status, fraud_status, order_id } = notification;

      fastify.log.info(`TopUp Notification: ${order_id} - ${transaction_status}`);

      if (transaction_status === 'capture' || transaction_status === 'settlement') {
        if (fraud_status !== 'challenge') {
          const { data: topup } = await supabase
            .from('credit_topups')
            .update({ status: 'settled' })
            .eq('order_id', order_id)
            .select()
            .single();

          if (topup) {
            // Tambahkan kredit ke subscription
            const { data: sub } = await supabase
              .from('subscriptions')
              .select('credits')
              .eq('org_id', topup.org_id)
              .maybeSingle();

            const currentCredits = sub?.credits ?? 0;

            await supabase
              .from('subscriptions')
              .update({ credits: currentCredits + topup.credits_purchased })
              .eq('org_id', topup.org_id);

            // Log credit transaction
            await supabase.from('credit_transactions').insert({
              org_id: topup.org_id,
              amount: topup.credits_purchased,
              type: 'topup',
              description: `Top-up ${topup.credits_purchased} kredit (Rp ${topup.amount.toLocaleString('id-ID')})`,
              reference: order_id,
            });

            fastify.log.info(`TopUp success: Org ${topup.org_id} +${topup.credits_purchased} credits`);
          }
        } else {
          await supabase.from('credit_topups').update({ status: 'challenge' }).eq('order_id', order_id);
        }
      } else if (['deny', 'cancel', 'expire'].includes(transaction_status)) {
        await supabase.from('credit_topups').update({ status: 'failed' }).eq('order_id', order_id);
      }

      return reply.send({ status: 'ok' });
    } catch (error: any) {
      fastify.log.error(error, 'TopUp webhook error');
      return reply.status(500).send({ success: false });
    }
  });

  /**
   * GET /payments/verify-topup/:orderId
   * Manual verify top-up setelah redirect Midtrans.
   */
  fastify.get('/payments/verify-topup/:orderId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orderId } = request.params as { orderId: string };

      let snap = new midtransClient.Snap({
        isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
        serverKey: process.env.MIDTRANS_SERVER_KEY || '',
        clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
      });

      const statusResponse = await snap.transaction.status(orderId);
      const transactionStatus = statusResponse.transaction_status;

      if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
        const { data: topup } = await supabase
          .from('credit_topups')
          .update({ status: 'settled' })
          .eq('order_id', orderId)
          .select()
          .single();

        if (topup) {
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('credits')
            .eq('org_id', topup.org_id)
            .maybeSingle();

          const currentCredits = sub?.credits ?? 0;

          await supabase
            .from('subscriptions')
            .update({ credits: currentCredits + topup.credits_purchased })
            .eq('org_id', topup.org_id);

          await supabase.from('credit_transactions').insert({
            org_id: topup.org_id,
            amount: topup.credits_purchased,
            type: 'topup',
            description: `Top-up ${topup.credits_purchased} kredit (Rp ${topup.amount.toLocaleString('id-ID')})`,
            reference: orderId,
          });

          return reply.send({ success: true, credits_added: topup.credits_purchased });
        }
      }

      return reply.send({ success: false, message: `Status: ${transactionStatus}` });
    } catch (error: any) {
      fastify.log.error(error, 'TopUp verify error');
      return reply.status(500).send({ success: false, message: error.message });
    }
  });

  fastify.get('/subscriptions/status', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id || '00000000-0000-0000-0000-000000000000';

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!org) {
        return reply.status(404).send({ success: false, message: 'Organization not found' });
      }

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('org_id', org.id)
        .maybeSingle();

      if (!sub) {
        return reply.status(404).send({ success: false, message: 'Subscription not found' });
      }

      // Calculate days remaining
      let daysRemaining = null;
      if (sub.expires_at) {
        const expires = new Date(sub.expires_at);
        const now = new Date();
        const diffTime = expires.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      return reply.send({
        success: true,
        data: {
          planType: sub.plan_type,
          status: sub.status,
          chatLimit: sub.chat_limit,
          expiresAt: sub.expires_at,
          daysRemaining: daysRemaining
        }
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, message: error.message });
    }
  });
}
