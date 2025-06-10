#!/usr/bin/env node

const app = require('./app');

const port = process.env.CLIENT_API_PORT || 3001;

app.listen(port, () => {
  console.log(`Client API server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}); 