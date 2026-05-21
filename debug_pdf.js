const { executeRAGPipeline } = require('./rag_engine');

async function main() {
  const result = await executeRAGPipeline('guest.intern', 'What are Q3 financial projections?');
  console.log('TRACE SECURITY ALERTS:', result.trace.security_alerts);
  console.log('STEPS:', JSON.stringify(result.trace.steps, null, 2));
}

main();
