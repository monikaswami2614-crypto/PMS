const apiBase = 'http://localhost:5000/api';
const email = 'test@example.com';
const password = 'pass123';
const absolutePath = 'C:/Users/rahul.sharma/Desktop/7. IGBC GH Lodha Panache, Pune - PC - First submission to IGBC';

async function login() {
  const res = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Login failed: ${JSON.stringify(body)}`);
  }
  return body.token;
}

async function findProjectId(token) {
  const res = await fetch(`${apiBase}/projects/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ absolutePath })
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Import check failed: ${JSON.stringify(body)}`);
  }
  return body.data.projectId;
}

async function printTree(token, projectId) {
  const res = await fetch(`${apiBase}/projects/${projectId}/tree`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Tree fetch failed: ${JSON.stringify(body)}`);
  }
  console.log(JSON.stringify(body, null, 2));
}

(async () => {
  try {
    const token = await login();
    const projectId = await findProjectId(token);
    console.log('Project ID:', projectId);
    await printTree(token, projectId);
  } catch (error) {
    console.error('ERROR:', error);
    process.exit(1);
  }
})();
