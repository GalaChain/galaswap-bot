import 'dotenv/config';

process.env.NODE_ENV = 'test';

Object.keys(process.env).forEach((key) => {
  if (!key.startsWith('TEST_') && key !== 'NODE_ENV') {
    delete process.env[key];
  }
});
