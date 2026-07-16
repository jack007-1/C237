const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

// Connection details
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'RP738964$',
  multipleStatements: true // Allows running the entire script in one query!
};

console.log('Connecting to MySQL local server...');
const connection = mysql.createConnection(dbConfig);

connection.connect((err) => {
  if (err) {
    console.error('Failed to connect to MySQL:', err.message);
    process.exit(1);
  }
  console.log('Connected successfully!');

  // Read SQL script
  const sqlPath = path.join(__dirname, 'database.sql');
  console.log(`Reading SQL file from ${sqlPath}...`);
  
  fs.readFile(sqlPath, 'utf8', (err, sql) => {
    if (err) {
      console.error('Failed to read SQL script:', err.message);
      connection.end();
      process.exit(1);
    }

    console.log('Running database setup and seeding...');
    connection.query(sql, (err, results) => {
      if (err) {
        console.error('Database setup failed:', err.message);
      } else {
        console.log('Database setup and seeding completed successfully!');
      }
      
      connection.end();
    });
  });
});
