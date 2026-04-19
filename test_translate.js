// Test translation API
const text = "Xin chào, đây là một phòng họp tiếng Việt";
const sourceLang = 'vi';
const targetLang = 'en';

console.log('Testing translation:');
console.log(`Text: ${text}`);
console.log(`From: ${sourceLang} -> To: ${targetLang}`);

fetch('http://localhost:3000/api/translate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, sourceLang, targetLang }),
})
  .then(res => res.json())
  .then(data => {
    console.log('\nResponse:', JSON.stringify(data, null, 2));
  })
  .catch(err => {
    console.error('Error:', err);
  });
