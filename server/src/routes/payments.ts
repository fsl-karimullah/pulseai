import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../config/supabase';
// @ts-ignore
import midtransClient from 'midtrans-client';

import { authenticate } from '../middleware/auth';

export default async function paymentsRoutes(fastify: FastifyInstance) {
  fastify.post('/payments/create-transaction', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { plan, amount, userEmail } = request.body as { plan: string; amount: number; userEmail: string };

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

      // 2. Save Pending Order to DB
      await supabase.from('payment_orders').insert({
        order_id: orderId,
        org_id: targetOrgId,
        plan_type: plan,
        amount: amount,
        status: 'pending'
      });

      // Prepare Midtrans Transaction parameter
      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        item_details: [
          {
            id: plan,
            price: amount,
            quantity: 1,
            name: `PulseAI ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
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
        token: transaction.token,
        redirect_url: transaction.redirect_url,
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
            // 2. Update Subscription
            const isAnnual = order.plan_type.includes('annual');
            const newLimit = order.plan_type.includes('business') ? 3000 : 2000; // Early access limit is 2000
            
            // Calculate expiration
            const expirationDate = new Date();
            if (isAnnual) {
              expirationDate.setFullYear(expirationDate.getFullYear() + 1);
            } else {
              expirationDate.setDate(expirationDate.getDate() + 30);
            }

            await supabase
              .from('subscriptions')
              .update({ 
                plan_type: order.plan_type,
                chat_limit: newLimit,
                status: 'active',
                expires_at: expirationDate.toISOString()
              })
              .eq('org_id', order.org_id);
              
            fastify.log.info(`Successfully upgraded Org ${order.org_id} to ${order.plan_type}`);
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
          const isAnnual = order.plan_type.includes('annual');
          const newLimit = order.plan_type.includes('business') ? 3000 : 2000;
          
          const expirationDate = new Date();
          if (isAnnual) {
            expirationDate.setFullYear(expirationDate.getFullYear() + 1);
          } else {
            expirationDate.setDate(expirationDate.getDate() + 30);
          }

          await supabase
            .from('subscriptions')
            .update({ 
              plan_type: order.plan_type,
              chat_limit: newLimit,
              status: 'active',
              expires_at: expirationDate.toISOString()
            })
            .eq('org_id', order.org_id);
            
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
