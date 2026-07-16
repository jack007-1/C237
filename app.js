const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = 3000;

// Setup views and engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if not exists
const fs = require('fs');
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Image Upload Configuration (B2)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to avoid collision
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Error: Only images of type JPG, JPEG, and PNG are allowed!'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Session configuration (A2)
app.use(session({
  secret: 'rp_market_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

// Flash middleware
app.use(flash());

// Pass user details and flash messages to all EJS templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// ==========================================
// AUTHENTICATION MIDDLEWARES (A3)
// ==========================================

const requireLogin = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  req.flash('error', 'You must be logged in to access that page.');
  res.redirect('/login');
};

const requireAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error', 'Access denied. Administrators only.');
  res.redirect('/');
};

// Verifies if the logged-in user is the owner of the listing (or an admin)
const isOwner = (req, res, next) => {
  const listingId = req.params.id;
  const userId = req.session.user.id;

  const sql = 'SELECT seller_id FROM listings WHERE id = ?';
  db.query(sql, [listingId], (err, results) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Database error.');
      return res.redirect('/');
    }
    if (results.length === 0) {
      req.flash('error', 'Listing not found.');
      return res.redirect('/');
    }

    if (results[0].seller_id === userId || req.session.user.role === 'admin') {
      return next();
    }

    req.flash('error', 'You are not authorized to perform that action.');
    res.redirect('/');
  });
};

// ==========================================
// MEMBER A — AUTHENTICATION & ACCESS CONTROL
// ==========================================

// GET /register
app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { title: 'Register', formData: {} });
});

// POST /register (A1)
app.post('/register', (req, res) => {
  const { username, email, password, contact_info } = req.body;

  if (!username || !email || !password || !contact_info) {
    req.flash('error', 'All fields are required.');
    return res.render('register', { title: 'Register', formData: req.body });
  }

  // Validate password length
  if (password.length < 6) {
    req.flash('error', 'Password must be at least 6 characters long.');
    return res.render('register', { title: 'Register', formData: req.body });
  }

  // Check unique username or email
  const checkSql = 'SELECT id FROM users WHERE username = ? OR email = ?';
  db.query(checkSql, [username, email], (err, results) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Database error.');
      return res.render('register', { title: 'Register', formData: req.body });
    }

    if (results.length > 0) {
      req.flash('error', 'Username or Email is already taken.');
      return res.render('register', { title: 'Register', formData: req.body });
    }

    // Insert user (SHA1 password hashing as per C237 specification)
    const insertSql = 'INSERT INTO users (username, email, password, contact_info, role) VALUES (?, ?, SHA1(?), ?, ?)';
    db.query(insertSql, [username, email, password, contact_info, 'user'], (err, result) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to register account.');
        return res.render('register', { title: 'Register', formData: req.body });
      }

      req.flash('success', 'Registration successful! Please log in.');
      res.redirect('/login');
    });
  });
});

// GET /login
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Login' });
});

// POST /login (A2, A4)
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/login');
  }

  // Invalid login shows generic error without revealing which field was wrong
  const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
  db.query(sql, [email, password], (err, results) => {
    if (err) {
      console.error(err);
      req.flash('error', 'An error occurred during login.');
      return res.redirect('/login');
    }

    if (results.length > 0) {
      req.session.user = results[0];
      req.flash('success', 'Welcome back, ' + results[0].username + '!');
      
      // Role-based redirect after login (A4)
      if (results[0].role === 'admin') {
        res.redirect('/admin/flags');
      } else {
        res.redirect('/');
      }
    } else {
      req.flash('error', 'Invalid email or password.');
      res.redirect('/login');
    }
  });
});

// GET /logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// ==========================================
// MEMBER C — BROWSE & VIEW (STOREFRONT)
// ==========================================

// GET / (C1, F1, F2, F3, F4) - Home Storefront
app.get('/', (req, res) => {
  const search = req.query.search || '';
  const category = req.query.category || 'All';
  const module_code = req.query.module_code || '';
  const min_price = req.query.min_price || '';
  const max_price = req.query.max_price || '';
  const condition = req.query.condition || 'All';
  const sort = req.query.sort || 'newest';

  // P0 constraint: Sold items are hidden from the active browse grid
  let sql = `
    SELECT l.*, u.username AS seller_name 
    FROM listings l 
    JOIN users u ON l.seller_id = u.id 
    WHERE l.status != 'sold'
  `;
  let queryParams = [];

  // Keyword search (F1): LIKE across title + description
  if (search) {
    sql += ' AND (l.title LIKE ? OR l.description LIKE ?)';
    queryParams.push(`%${search}%`, `%${search}%`);
  }

  // Category filter (F3)
  if (category !== 'All') {
    sql += ' AND l.category = ?';
    queryParams.push(category);
  }

  // Search by module code (F2): Exact or prefix match
  if (module_code) {
    sql += ' AND l.module_code LIKE ?';
    queryParams.push(`${module_code}%`);
  }

  // Price range filters (F4)
  if (min_price) {
    sql += ' AND l.price >= ?';
    queryParams.push(parseFloat(min_price));
  }
  if (max_price) {
    sql += ' AND l.price <= ?';
    queryParams.push(parseFloat(max_price));
  }

  // Condition filter (F4)
  if (condition !== 'All') {
    sql += ' AND l.item_condition = ?';
    queryParams.push(condition);
  }

  // Sorting: price_asc, price_desc, newest (F3)
  if (sort === 'price_asc') {
    sql += ' ORDER BY l.price ASC';
  } else if (sort === 'price_desc') {
    sql += ' ORDER BY l.price DESC';
  } else {
    sql += ' ORDER BY l.created_at DESC'; // default newest
  }

  db.query(sql, queryParams, (err, listings) => {
    if (err) {
      console.error(err);
      return res.send('Database error loading storefront.');
    }

    res.render('index', {
      title: 'RPMarket Storefront',
      listings,
      filters: {
        search,
        category,
        module_code,
        min_price,
        max_price,
        condition,
        sort
      }
    });
  });
});

// GET /listings/:id (C2) - Detailed view
app.get('/listings/:id', (req, res) => {
  const listingId = req.params.id;

  // Retrieve listing, JOINing with users to get seller name and contact_info
  const sql = `
    SELECT l.*, u.username AS seller_name, u.contact_info AS seller_contact 
    FROM listings l 
    JOIN users u ON l.seller_id = u.id 
    WHERE l.id = ?
  `;

  db.query(sql, [listingId], (err, results) => {
    if (err) {
      console.error(err);
      return res.send('Database error.');
    }

    if (results.length === 0) {
      req.flash('error', 'Listing not found.');
      return res.redirect('/');
    }

    const listing = results[0];

    // Fetch active reservations for this listing if any (Member D status buttons reference)
    const reserveSql = 'SELECT * FROM reservations WHERE listing_id = ? AND status = "active"';
    db.query(reserveSql, [listingId], (err, reservations) => {
      if (err) console.error(err);
      
      const activeReservation = reservations && reservations.length > 0 ? reservations[0] : null;

      res.render('listing-detail', {
        title: listing.title,
        listing,
        activeReservation
      });
    });
  });
});

// GET /my-listings (C3) - Seller dashboard
app.get('/my-listings', requireLogin, (req, res) => {
  const userId = req.session.user.id;

  // Personalised dashboard with counts per status (GROUP BY)
  const countSql = `
    SELECT status, COUNT(*) AS count 
    FROM listings 
    WHERE seller_id = ? 
    GROUP BY status
  `;

  const listingsSql = `
    SELECT * 
    FROM listings 
    WHERE seller_id = ? 
    ORDER BY created_at DESC
  `;

  db.query(countSql, [userId], (err, countsResults) => {
    if (err) {
      console.error(err);
      return res.send('Database error.');
    }

    // Process counts into helper object
    const statusCounts = { available: 0, reserved: 0, sold: 0 };
    countsResults.forEach(row => {
      statusCounts[row.status] = row.count;
    });

    db.query(listingsSql, [userId], (err, listings) => {
      if (err) {
        console.error(err);
        return res.send('Database error.');
      }

      res.render('my-listings', {
        title: 'My Listings Dashboard',
        statusCounts,
        listings
      });
    });
  });
});

// ==========================================
// MEMBER B — CREATE LISTING
// ==========================================

// GET /listings/new
app.get('/listings/new', requireLogin, (req, res) => {
  res.render('new-listing', { title: 'Create Listing', formData: {} });
});

// POST /listings (B1, B2, B3, B4)
app.post('/listings', requireLogin, upload.single('image'), (req, res) => {
  const sellerId = req.session.user.id;
  const { title, description, category, module_code, price, item_condition, confirm_duplicate } = req.body;
  const imageFilename = req.file ? req.file.filename : null;

  // Validation server-side (B1)
  if (!title || !description || !category || !price || !item_condition) {
    req.flash('error', 'All fields except module code and image are required.');
    return res.render('new-listing', { title: 'Create Listing', formData: req.body });
  }

  // Price validation: positive number
  if (parseFloat(price) < 0) {
    req.flash('error', 'Price must be a positive number.');
    return res.render('new-listing', { title: 'Create Listing', formData: req.body });
  }

  // Module code validation (B3): letter+3digits format (e.g. C237)
  if (module_code) {
    const modulePattern = /^[a-zA-Z]\d{3}$/;
    if (!modulePattern.test(module_code.trim())) {
      req.flash('error', 'Module code must be 1 letter followed by 3 numbers (e.g. C237).');
      return res.render('new-listing', { title: 'Create Listing', formData: req.body });
    }
  }

  // Check duplicate warning (B4)
  if (!confirm_duplicate) {
    const dupSql = 'SELECT id FROM listings WHERE seller_id = ? AND title = ? AND status = "available"';
    db.query(dupSql, [sellerId, title], (err, results) => {
      if (err) console.error(err);

      if (results.length > 0) {
        // Render form with duplicate warning flag
        req.flash('error', 'Warning: You already have an active listing with this same title.');
        return res.render('new-listing', {
          title: 'Create Listing',
          formData: req.body,
          showDuplicateWarning: true
        });
      }

      // Proceed with normal insert
      insertListing();
    });
  } else {
    // Duplicate confirmed, insert
    insertListing();
  }

  function insertListing() {
    const cleanModule = module_code ? module_code.trim().toUpperCase() : null;
    const sql = 'INSERT INTO listings (seller_id, title, description, category, module_code, price, item_condition, status, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db.query(sql, [sellerId, title, description, category, cleanModule, parseFloat(price), item_condition, 'available', imageFilename], (err, result) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to create listing in database.');
        return res.render('new-listing', { title: 'Create Listing', formData: req.body });
      }

      req.flash('success', 'Listing created successfully!');
      res.redirect('/my-listings');
    });
  }
});

// ==========================================
// MEMBER D — EDIT & STATUS WORKFLOW
// ==========================================

// GET /listings/:id/edit (D1)
app.get('/listings/:id/edit', requireLogin, isOwner, (req, res) => {
  const listingId = req.params.id;

  const sql = 'SELECT * FROM listings WHERE id = ?';
  db.query(sql, [listingId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Listing not found.');
      return res.redirect('/');
    }

    res.render('edit-listing', {
      title: 'Edit Listing',
      listing: results[0]
    });
  });
});

// POST /listings/:id/edit (D1, D2)
app.post('/listings/:id/edit', requireLogin, isOwner, upload.single('image'), (req, res) => {
  const listingId = req.params.id;
  const { title, description, category, module_code, price, item_condition } = req.body;

  // Validation
  if (!title || !description || !category || !price || !item_condition) {
    req.flash('error', 'All fields except module code and image are required.');
    return res.redirect(`/listings/${listingId}/edit`);
  }

  if (parseFloat(price) < 0) {
    req.flash('error', 'Price must be positive.');
    return res.redirect(`/listings/${listingId}/edit`);
  }

  if (module_code) {
    const modulePattern = /^[a-zA-Z]\d{3}$/;
    if (!modulePattern.test(module_code.trim())) {
      req.flash('error', 'Module code must be 1 letter followed by 3 numbers (e.g. C237).');
      return res.redirect(`/listings/${listingId}/edit`);
    }
  }

  // Fetch current image path
  const fetchImgSql = 'SELECT image FROM listings WHERE id = ?';
  db.query(fetchImgSql, [listingId], (err, imgResults) => {
    if (err) console.error(err);

    // Keep old image if none uploaded (D2)
    const imageFilename = req.file ? req.file.filename : (imgResults.length > 0 ? imgResults[0].image : null);
    const cleanModule = module_code ? module_code.trim().toUpperCase() : null;

    const sql = 'UPDATE listings SET title = ?, description = ?, category = ?, module_code = ?, price = ?, item_condition = ?, image = ? WHERE id = ?';
    db.query(sql, [title, description, category, cleanModule, parseFloat(price), item_condition, imageFilename, listingId], (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to update listing.');
        return res.redirect(`/listings/${listingId}/edit`);
      }

      req.flash('success', 'Listing updated successfully!');
      res.redirect(`/listings/${listingId}`);
    });
  });
});

// POST /listings/:id/reserve (D3)
app.post('/listings/:id/reserve', requireLogin, (req, res) => {
  const listingId = req.params.id;
  const buyerId = req.session.user.id;

  // Verify listing is available and user is not the seller
  const checkSql = 'SELECT seller_id, status FROM listings WHERE id = ?';
  db.query(checkSql, [listingId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Listing not found.');
      return res.redirect('/');
    }

    const listing = results[0];
    if (listing.seller_id === buyerId) {
      req.flash('error', 'You cannot reserve your own listing.');
      return res.redirect(`/listings/${listingId}`);
    }

    if (listing.status !== 'available') {
      req.flash('error', 'This listing is no longer available.');
      return res.redirect(`/listings/${listingId}`);
    }

    // Set state: available -> reserved
    const updateListingSql = 'UPDATE listings SET status = "reserved" WHERE id = ?';
    const insertReserveSql = 'INSERT INTO reservations (listing_id, buyer_id, status) VALUES (?, ?, "active")';

    db.query(updateListingSql, [listingId], (err) => {
      if (err) console.error(err);

      db.query(insertReserveSql, [listingId, buyerId], (err) => {
        if (err) console.error(err);

        req.flash('success', 'Listing reserved successfully! The seller has been notified.');
        res.redirect(`/listings/${listingId}`);
      });
    });
  });
});

// POST /listings/:id/status (D3) - Confirm sale / release reservation (Owner-only)
app.post('/listings/:id/status', requireLogin, isOwner, (req, res) => {
  const listingId = req.params.id;
  const { action } = req.body; // 'confirm_sale' or 'release_reservation'

  // Get active reservation
  const activeResSql = 'SELECT * FROM reservations WHERE listing_id = ? AND status = "active"';
  db.query(activeResSql, [listingId], (err, resResults) => {
    if (err || resResults.length === 0) {
      req.flash('error', 'No active reservation found.');
      return res.redirect(`/listings/${listingId}`);
    }

    const reservationId = resResults[0].id;

    if (action === 'confirm_sale') {
      // reserved -> sold
      const updateListing = 'UPDATE listings SET status = "sold" WHERE id = ?';
      const updateReservation = 'UPDATE reservations SET status = "completed" WHERE id = ?';

      db.query(updateListing, [listingId], (err) => {
        if (err) console.error(err);
        db.query(updateReservation, [reservationId], (err) => {
          if (err) console.error(err);
          req.flash('success', 'Sale confirmed! Listing is marked as sold.');
          res.redirect(`/listings/${listingId}`);
        });
      });

    } else if (action === 'release_reservation') {
      // reserved -> available
      const updateListing = 'UPDATE listings SET status = "available" WHERE id = ?';
      const updateReservation = 'UPDATE reservations SET status = "released" WHERE id = ?';

      db.query(updateListing, [listingId], (err) => {
        if (err) console.error(err);
        db.query(updateReservation, [reservationId], (err) => {
          if (err) console.error(err);
          req.flash('success', 'Reservation released. The listing is available again.');
          res.redirect(`/listings/${listingId}`);
        });
      });
    }
  });
});

// GET /my-reservations (D4) - Buyer reservations list
app.get('/my-reservations', requireLogin, (req, res) => {
  const buyerId = req.session.user.id;

  const sql = `
    SELECT r.id AS reservation_id, r.status AS reservation_status, r.created_at AS reserved_at,
           l.id AS listing_id, l.title, l.price, l.category, l.status AS listing_status,
           u.username AS seller_name, u.contact_info AS seller_contact
    FROM reservations r
    JOIN listings l ON r.listing_id = l.id
    JOIN users u ON l.seller_id = u.id
    WHERE r.buyer_id = ?
    ORDER BY r.created_at DESC
  `;

  db.query(sql, [buyerId], (err, results) => {
    if (err) {
      console.error(err);
      return res.send('Database error.');
    }

    res.render('my-reservations', {
      title: 'My Reservations',
      reservations: results
    });
  });
});

// ==========================================
// MEMBER E — DELETE & MODERATION
// ==========================================

// GET /listings/:id/delete (E1) - owner delete confirmation
app.get('/listings/:id/delete', requireLogin, isOwner, (req, res) => {
  const listingId = req.params.id;

  const sql = 'SELECT * FROM listings WHERE id = ?';
  db.query(sql, [listingId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Listing not found.');
      return res.redirect('/');
    }

    res.render('confirm-delete', {
      title: 'Confirm Deletion',
      listing: results[0]
    });
  });
});

// POST /listings/:id/delete (E1) - handle deletion
app.post('/listings/:id/delete', requireLogin, isOwner, (req, res) => {
  const listingId = req.params.id;

  // Foreign keys on reservations/flags are set to CASCADE in database.sql schema.
  // This automatically cleans up orphans in those tables.
  const sql = 'DELETE FROM listings WHERE id = ?';
  db.query(sql, [listingId], (err) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to delete listing.');
      return res.redirect(`/listings/${listingId}`);
    }

    req.flash('success', 'Listing deleted successfully.');
    res.redirect('/my-listings');
  });
});

// POST /listings/:id/flag (E2) - flag listing
app.post('/listings/:id/flag', requireLogin, (req, res) => {
  const listingId = req.params.id;
  const reporterId = req.session.user.id;
  const { reason } = req.body;

  if (!reason || reason.trim() === '') {
    req.flash('error', 'A reason for flagging must be provided.');
    return res.redirect(`/listings/${listingId}`);
  }

  // Prevent duplicate flags by same user on same listing (E2)
  const checkSql = 'SELECT id FROM flags WHERE listing_id = ? AND reporter_id = ? AND status = "open"';
  db.query(checkSql, [listingId, reporterId], (err, results) => {
    if (err) console.error(err);

    if (results.length > 0) {
      req.flash('error', 'You have already flagged this listing.');
      return res.redirect(`/listings/${listingId}`);
    }

    const insertSql = 'INSERT INTO flags (listing_id, reporter_id, reason, status) VALUES (?, ?, ?, "open")';
    db.query(insertSql, [listingId, reporterId, reason.trim(), 'open'], (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to submit flag.');
      } else {
        req.flash('success', 'Listing reported successfully. Moderators will review it.');
      }
      res.redirect(`/listings/${listingId}`);
    });
  });
});

// GET /admin/flags (E3) - moderation dashboard
app.get('/admin/flags', requireLogin, requireAdmin, (req, res) => {
  // Join flags, listings, and users to get all open flags
  const sql = `
    SELECT f.id AS flag_id, f.reason, f.created_at AS flagged_at,
           l.id AS listing_id, l.title AS listing_title, l.status AS listing_status, l.price,
           u_rep.username AS reporter_name,
           u_sel.username AS seller_name
    FROM flags f
    JOIN listings l ON f.listing_id = l.id
    JOIN users u_rep ON f.reporter_id = u_rep.id
    JOIN users u_sel ON l.seller_id = u_sel.id
    WHERE f.status = 'open'
    ORDER BY f.created_at DESC
  `;

  // Counts by category/status via GROUP BY (E4)
  const categoryStatsSql = `
    SELECT category, COUNT(*) as count 
    FROM listings 
    GROUP BY category
  `;
  const statusStatsSql = `
    SELECT status, COUNT(*) as count 
    FROM listings 
    GROUP BY status
  `;

  db.query(`${sql}; ${categoryStatsSql}; ${statusStatsSql}`, (err, results) => {
    if (err) {
      console.error(err);
      return res.send('Database error.');
    }

    const flaggedItems = results[0];
    const categoryStats = results[1];
    const statusStats = results[2];

    res.render('admin-flags', {
      title: 'Admin Moderation Queue',
      flags: flaggedItems,
      categoryStats,
      statusStats
    });
  });
});

// POST /flags/:id/resolve (E3)
app.post('/flags/:id/resolve', requireLogin, requireAdmin, (req, res) => {
  const flagId = req.params.id;
  const { action } = req.body; // 'dismiss' or 'remove_listing'

  if (action === 'dismiss') {
    // Just mark flag as resolved
    const sql = 'UPDATE flags SET status = "resolved" WHERE id = ?';
    db.query(sql, [flagId], (err) => {
      if (err) console.error(err);
      req.flash('success', 'Flag report dismissed.');
      res.redirect('/admin/flags');
    });

  } else if (action === 'remove_listing') {
    // Delete listing (associated flags will cascade delete)
    const findListingSql = 'SELECT listing_id FROM flags WHERE id = ?';
    db.query(findListingSql, [flagId], (err, results) => {
      if (err || results.length === 0) {
        req.flash('error', 'Listing target not found.');
        return res.redirect('/admin/flags');
      }

      const listingId = results[0].listing_id;
      const deleteSql = 'DELETE FROM listings WHERE id = ?';
      db.query(deleteSql, [listingId], (err) => {
        if (err) {
          console.error(err);
          req.flash('error', 'Failed to delete listing.');
        } else {
          req.flash('success', 'Listing removed successfully from marketplace.');
        }
        res.redirect('/admin/flags');
      });
    });
  }
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`RPMarket App is running at http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  }
  throw error;
});
