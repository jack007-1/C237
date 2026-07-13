const mysql = require('mysql2');
require('dotenv').config();

// Create a connection pool to manage database connections
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'RP738964$',
  database: process.env.DB_NAME || 'planit_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection
db.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to MySQL Database:', err.message);
  } else {
    console.log('Successfully connected to MySQL database pool');
    connection.release();
  }
});

module.exports = db;
