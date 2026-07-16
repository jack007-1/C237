const mysql = require('mysql2');

// Create a connection pool to manage database connections
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'RP738964$',
  database: 'rp_market_db',
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
