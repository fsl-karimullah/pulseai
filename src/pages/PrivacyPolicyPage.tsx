import React from 'react';

const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: August 2026</p>

        <div className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Introduction</h2>
            <p className="text-slate-600 leading-relaxed">
              Welcome to PulseAI ("we", "our", or "us"). We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website, use our application, or interact with our WhatsApp Business API integration (the "Service").
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Data We Collect via WhatsApp</h2>
            <p className="text-slate-600 leading-relaxed mb-2">
              When you interact with our WhatsApp Business account or our clients' WhatsApp bots powered by PulseAI, we may collect and process the following data:
            </p>
            <ul className="list-disc pl-5 text-slate-600 space-y-1">
              <li><strong>Contact Information:</strong> Phone number and WhatsApp profile name.</li>
              <li><strong>Message Content:</strong> Text, media, and other information shared in the chat.</li>
              <li><strong>Technical Data:</strong> WhatsApp IDs, timestamp of messages, and metadata required for message delivery.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. How We Use Your Data</h2>
            <p className="text-slate-600 leading-relaxed mb-2">
              We use the collected information for the following purposes:
            </p>
            <ul className="list-disc pl-5 text-slate-600 space-y-1">
              <li>To provide, operate, and maintain our AI chatbot and messaging services.</li>
              <li>To process and respond to your inquiries seamlessly via WhatsApp.</li>
              <li>To improve the accuracy and quality of our AI responses (data is anonymized where applicable).</li>
              <li>To comply with legal obligations and Meta's WhatsApp Business Terms of Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Data Sharing & Third Parties</h2>
            <p className="text-slate-600 leading-relaxed">
              We do not sell your personal data. Data transmitted through our WhatsApp integration is processed in accordance with Meta's Privacy Policy. We may share information with our trusted cloud service providers (e.g., Supabase, Google Cloud) strictly for hosting and processing purposes under secure, confidential agreements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Data Retention & Deletion</h2>
            <p className="text-slate-600 leading-relaxed">
              We retain personal data only for as long as necessary to fulfill the purposes we collected it for, including for the purposes of satisfying any legal, accounting, or reporting requirements. You have the right to request the deletion of your chat history and contact data by contacting our support team or by opting out in the WhatsApp chat.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Your Legal Rights</h2>
            <p className="text-slate-600 leading-relaxed">
              Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to request access, correction, erasure, or restriction of processing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Contact Us</h2>
            <p className="text-slate-600 leading-relaxed">
              If you have any questions about this privacy policy or our privacy practices, please contact us at: <br />
              <strong>Email:</strong> privacy@pulseai.biz.id
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
