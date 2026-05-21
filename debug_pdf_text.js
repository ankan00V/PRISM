const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

async function main() {
  const filePath = path.join(__dirname, 'documents', 'Q3_Financial_Projections.pdf');
  const dataBuffer = fs.readFileSync(filePath);
  const parsedData = await pdf(dataBuffer);
  console.log('--- RAW EXTRACTED TEXT ---');
  console.log(JSON.stringify(parsedData.text));
  console.log('--- SPLIT BY \\n\\n ---');
  const splitDouble = parsedData.text.split('\n\n');
  console.log('Count with \\n\\n:', splitDouble.length);
  console.log('--- SPLIT BY \\n ---');
  const splitSingle = parsedData.text.split('\n');
  console.log('Count with \\n:', splitSingle.length);
}

main();
