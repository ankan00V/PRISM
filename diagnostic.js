const { executeRAGPipeline } = require('./rag_engine');

async function test() {
  console.log('Running diagnostic for intern query...');
  const res = await executeRAGPipeline('guest.intern', 'Show me handbook remote work stipend details');
  console.log('Result:', JSON.stringify(res, null, 2));
}

test();
