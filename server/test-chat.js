import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const API_URL = 'http://localhost:3001/api/chat';
let history = [];
let conversationId = `session-${Math.random().toString(36).substring(7)}`;

console.log('\n=============================================');
console.log('🤖 NexusAI CLI Chatbot Testing Interface');
console.log('=============================================');
console.log(`Session ID: ${conversationId}`);
console.log('Type "exit" or "quit" to stop.');
console.log('Type your message to test RAG and Lead Capture.\n');

const promptUser = () => {
  rl.question('You: ', async (message) => {
    if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
      console.log('Goodbye!');
      rl.close();
      return;
    }

    if (!message.trim()) {
      promptUser();
      return;
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history,
          conversationId,
          botName: 'Aria',
          company: 'NexusAI'
        })
      });

      const data = await response.json();

      if (!data.success) {
        console.error('❌ Bot Error:', data.message);
      } else {
        console.log(`\nBot: ${data.message}`);
        
        if (data.sources && data.sources.length > 0) {
          console.log(`\n[📚 Sources used: ${data.sources.map(s => s.title).join(', ')}]`);
        }

        if (data.triggerLeadCapture) {
          console.log('\n[🔥 LEAD CAPTURED 🔥] -> Check your dashboard!');
        }
        
        // Update history
        history.push({ role: 'user', content: message });
        history.push({ role: 'model', content: data.message });
      }
    } catch (err) {
      console.error('\n❌ Failed to connect to backend. Is the server running on port 3001?');
    }

    console.log('\n---------------------------------------------');
    promptUser();
  });
};

promptUser();
