const apiBase = 'http://localhost:5000/api';
const email = 'test@example.com';
const password = 'pass123';
const absolutePath = 'C:/Users/rahul.sharma/Desktop/7. IGBC GH Lodha Panache, Pune - PC - First submission to IGBC';

async function main() {
  console.log('fetch available:', typeof fetch);
  const loginRes = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    console.error('Login failed', loginData);
    process.exit(1);
  }
  const token = loginData.token;
  console.log('Login success:', loginData.message);

  const importRes = await fetch(`${apiBase}/projects/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ absolutePath })
  });
  const importData = await importRes.json();
  console.log('Import response status:', importRes.status);
  console.log(JSON.stringify(importData, null, 2));
}

main().catch((error) => {
  console.error('SCRIPT ERROR:', error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
