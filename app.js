const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'planit_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
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

// Authentication Middlewares
const checkAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  } else {
    req.flash('error', 'Please log in to access this page.');
    res.redirect('/login');
  }
};

const checkAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  } else {
    req.flash('error', 'Access denied. Administrator privileges required.');
    res.redirect('/dashboard');
  }
};

// ==========================================
// 1. LANDING & AUTH ROUTES
// ==========================================

// Landing Page
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('index', { title: 'Welcome to PlanIt' });
});

// Login Page - Render
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { title: 'Login' });
});

// Login Page - Handle Submission
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    req.flash('error', 'Please fill in all fields.');
    return res.redirect('/login');
  }

  // SHA1 used for password hashing as per C237 guidelines
  const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
  db.query(sql, [email, password], (err, results) => {
    if (err) {
      console.error(err);
      req.flash('error', 'An error occurred during login.');
      return res.redirect('/login');
    }

    if (results.length > 0) {
      req.session.user = results[0];
      req.flash('success', 'Logged in successfully!');
      res.redirect('/dashboard');
    } else {
      req.flash('error', 'Invalid email or password.');
      res.redirect('/login');
    }
  });
});

// Register Page - Render
app.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('register', { title: 'Register', formData: {} });
});

// Register Page - Handle Submission
app.post('/register', (req, res) => {
  const { username, email, password, address, contact } = req.body;

  // Validation
  if (!username || !email || !password || !address || !contact) {
    req.flash('error', 'All fields are required.');
    return res.render('register', { title: 'Register', formData: req.body });
  }

  if (password.length < 6) {
    req.flash('error', 'Password must be at least 6 characters.');
    return res.render('register', { title: 'Register', formData: req.body });
  }

  // Check if email already exists
  const checkEmailSql = 'SELECT * FROM users WHERE email = ?';
  db.query(checkEmailSql, [email], (err, results) => {
    if (err) {
      console.error(err);
      req.flash('error', 'An error occurred.');
      return res.render('register', { title: 'Register', formData: req.body });
    }

    if (results.length > 0) {
      req.flash('error', 'Email is already registered.');
      return res.render('register', { title: 'Register', formData: req.body });
    }

    // Insert user into DB
    const insertSql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    db.query(insertSql, [username, email, password, address, contact, 'member'], (err, result) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to register.');
        return res.render('register', { title: 'Register', formData: req.body });
      }

      req.flash('success', 'Registration successful! Please log in.');
      res.redirect('/login');
    });
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// ==========================================
// 2. DASHBOARD ROUTES
// ==========================================
app.get('/dashboard', checkAuthenticated, (req, res) => {
  const user = req.session.user;

  if (user.role === 'admin') {
    // Admin Dashboard Statistics
    const sqlUsersCount = 'SELECT COUNT(*) as count FROM users WHERE role = "member"';
    const sqlEventsCount = 'SELECT COUNT(*) as count FROM events';
    const sqlTotalBudget = 'SELECT SUM(budget) as total FROM events';
    const sqlEventsByCategory = 'SELECT category, COUNT(*) as count FROM events GROUP BY category';

    db.query(`${sqlUsersCount}; ${sqlEventsCount}; ${sqlTotalBudget}; ${sqlEventsByCategory}`, (err, results) => {
      if (err) {
        console.error(err);
        return res.send('Database error loading admin dashboard');
      }

      const totalMembers = results[0][0].count;
      const totalEvents = results[1][0].count;
      const totalBudget = results[2][0].total || 0;
      const categoryStats = results[3];

      res.render('dashboard', {
        title: 'Admin Dashboard',
        stats: {
          totalMembers,
          totalEvents,
          totalBudget,
          categoryStats
        }
      });
    });
  } else {
    // Member Dashboard (Personalized)
    const sqlUserEvents = 'SELECT * FROM events WHERE user_id = ? ORDER BY event_date ASC';
    // Aggregate sum of budget and sum of task costs (actual expenses) for this user's events
    const sqlBudgetSummary = `
      SELECT 
        SUM(e.budget) as totalBudget,
        IFNULL(SUM(t.cost), 0) as totalSpent
      FROM events e
      LEFT JOIN event_tasks t ON e.event_id = t.event_id
      WHERE e.user_id = ?
    `;
    // Fetch upcoming tasks due within 7 days
    const sqlUrgentTasks = `
      SELECT t.*, e.title as event_title 
      FROM event_tasks t
      JOIN events e ON t.event_id = e.event_id
      WHERE e.user_id = ? AND t.status != 'Completed' AND t.due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
      ORDER BY t.due_date ASC
    `;

    db.query(`${sqlUserEvents}; ${sqlBudgetSummary}; ${sqlUrgentTasks}`, [user.id, user.id, user.id], (err, results) => {
      if (err) {
        console.error(err);
        return res.send('Database error loading dashboard');
      }

      const events = results[0];
      const budgetSummary = results[1][0];
      const urgentTasks = results[2];

      // Next upcoming event countdown
      let nextEvent = null;
      let daysRemaining = null;
      const now = new Date();
      now.setHours(0,0,0,0);

      for (const e of events) {
        const eventDate = new Date(e.event_date);
        if (eventDate >= now) {
          nextEvent = e;
          const diffTime = Math.abs(eventDate - now);
          daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          break;
        }
      }

      res.render('dashboard', {
        title: 'My Dashboard',
        events,
        budgetSummary,
        urgentTasks,
        nextEvent,
        daysRemaining
      });
    });
  }
});

// ==========================================
// 3. EVENT CRUD ROUTES (PERSONALIZED & AUTH)
// ==========================================

// List Events with Search, Filtering, and Sorting
app.get('/events', checkAuthenticated, (req, res) => {
  const user = req.session.user;
  const search = req.query.search || '';
  const category = req.query.category || 'All';
  const sort = req.query.sort || 'event_date_asc';

  let sql = 'SELECT * FROM events';
  let queryParams = [];

  // Member gets only their events; Admin gets all events
  if (user.role !== 'admin') {
    sql += ' WHERE user_id = ?';
    queryParams.push(user.id);
  } else {
    sql += ' WHERE 1=1';
  }

  // Search Filter
  if (search) {
    sql += ' AND (title LIKE ? OR description LIKE ? OR location LIKE ?)';
    const searchWildcard = `%${search}%`;
    queryParams.push(searchWildcard, searchWildcard, searchWildcard);
  }

  // Category Filter
  if (category !== 'All') {
    sql += ' AND category = ?';
    queryParams.push(category);
  }

  // Sorting
  if (sort === 'event_date_asc') {
    sql += ' ORDER BY event_date ASC';
  } else if (sort === 'event_date_desc') {
    sql += ' ORDER BY event_date DESC';
  } else if (sort === 'budget_desc') {
    sql += ' ORDER BY budget DESC';
  } else if (sort === 'budget_asc') {
    sql += ' ORDER BY budget ASC';
  }

  // Retrieve distinct categories for the filter dropdown
  let catSql = 'SELECT DISTINCT category FROM events';
  let catParams = [];
  if (user.role !== 'admin') {
    catSql += ' WHERE user_id = ?';
    catParams.push(user.id);
  }

  db.query(sql, queryParams, (err, events) => {
    if (err) {
      console.error(err);
      return res.send('Database error loading events');
    }

    db.query(catSql, catParams, (err, categories) => {
      if (err) console.error(err);
      
      const distinctCategories = categories ? categories.map(c => c.category) : [];
      res.render('events/list', {
        title: 'Events',
        events,
        categories: distinctCategories,
        selectedCategory: category,
        search,
        selectedSort: sort
      });
    });
  });
});

// Render Create Event Page
app.get('/events/new', checkAuthenticated, (req, res) => {
  res.render('events/add', { title: 'Create New Event' });
});

// Create Event - Post Route
app.post('/events', checkAuthenticated, (req, res) => {
  const user = req.session.user;
  const { title, description, event_date, event_time, location, category, budget } = req.body;

  if (!title || !event_date || !event_time || !location || !category || !budget) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/events/new');
  }

  const sql = 'INSERT INTO events (user_id, title, description, event_date, event_time, location, category, budget) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(sql, [user.id, title, description || '', event_date, event_time, location, category, budget], (err, result) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to create event.');
      return res.redirect('/events/new');
    }

    req.flash('success', 'Event created successfully!');
    res.redirect('/events');
  });
});

// View Single Event Detail (and its Tasks/Budget)
app.get('/events/:id', checkAuthenticated, (req, res) => {
  const eventId = req.params.id;
  const user = req.session.user;

  // Query event details
  const eventSql = 'SELECT * FROM events WHERE event_id = ?';
  // Query tasks for this event
  const tasksSql = 'SELECT * FROM event_tasks WHERE event_id = ? ORDER BY due_date ASC';

  db.query(eventSql, [eventId], (err, eventResults) => {
    if (err) {
      console.error(err);
      return res.send('Database error loading event');
    }

    if (eventResults.length === 0) {
      req.flash('error', 'Event not found.');
      return res.redirect('/events');
    }

    const event = eventResults[0];

    // Authorization check: User can only view their own events unless they are admin
    if (user.role !== 'admin' && event.user_id !== user.id) {
      req.flash('error', 'Access denied. You cannot view this event.');
      return res.redirect('/events');
    }

    db.query(tasksSql, [eventId], (err, tasks) => {
      if (err) {
        console.error(err);
        return res.send('Database error loading tasks');
      }

      // Calculate aggregates
      const totalBudget = parseFloat(event.budget);
      const totalSpent = tasks.reduce((sum, task) => sum + parseFloat(task.cost), 0);
      const remainingBudget = totalBudget - totalSpent;
      const budgetProgressPercent = Math.min(100, Math.round((totalSpent / totalBudget) * 100)) || 0;

      res.render('events/detail', {
        title: event.title,
        event,
        tasks,
        totalSpent,
        remainingBudget,
        budgetProgressPercent
      });
    });
  });
});

// Render Edit Event Form
app.get('/events/:id/edit', checkAuthenticated, (req, res) => {
  const eventId = req.params.id;
  const user = req.session.user;

  const sql = 'SELECT * FROM events WHERE event_id = ?';
  db.query(sql, [eventId], (err, results) => {
    if (err) {
      console.error(err);
      return res.send('Database error');
    }

    if (results.length === 0) {
      req.flash('error', 'Event not found.');
      return res.redirect('/events');
    }

    const event = results[0];

    // Auth check
    if (user.role !== 'admin' && event.user_id !== user.id) {
      req.flash('error', 'Access denied.');
      return res.redirect('/events');
    }

    // Format date string for HTML5 date input (YYYY-MM-DD)
    const formattedDate = new Date(event.event_date).toISOString().split('T')[0];
    
    res.render('events/edit', {
      title: `Edit: ${event.title}`,
      event,
      formattedDate
    });
  });
});

// Update Event - Post Route
app.post('/events/:id', checkAuthenticated, (req, res) => {
  const eventId = req.params.id;
  const user = req.session.user;
  const { title, description, event_date, event_time, location, category, budget, status } = req.body;

  if (!title || !event_date || !event_time || !location || !category || !budget || !status) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect(`/events/${eventId}/edit`);
  }

  // Fetch event to verify ownership
  const verifySql = 'SELECT * FROM events WHERE event_id = ?';
  db.query(verifySql, [eventId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Event not found.');
      return res.redirect('/events');
    }

    const event = results[0];
    if (user.role !== 'admin' && event.user_id !== user.id) {
      req.flash('error', 'Access denied.');
      return res.redirect('/events');
    }

    const sql = 'UPDATE events SET title = ?, description = ?, event_date = ?, event_time = ?, location = ?, category = ?, budget = ?, status = ? WHERE event_id = ?';
    db.query(sql, [title, description || '', event_date, event_time, location, category, budget, status, eventId], (err, result) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to update event.');
        return res.redirect(`/events/${eventId}/edit`);
      }

      req.flash('success', 'Event updated successfully!');
      res.redirect(`/events/${eventId}`);
    });
  });
});

// Delete Event
app.get('/events/:id/delete', checkAuthenticated, (req, res) => {
  const eventId = req.params.id;
  const user = req.session.user;

  // Verify permission
  const verifySql = 'SELECT * FROM events WHERE event_id = ?';
  db.query(verifySql, [eventId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Event not found.');
      return res.redirect('/events');
    }

    const event = results[0];
    if (user.role !== 'admin' && event.user_id !== user.id) {
      req.flash('error', 'Access denied.');
      return res.redirect('/events');
    }

    const sql = 'DELETE FROM events WHERE event_id = ?';
    db.query(sql, [eventId], (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to delete event.');
      } else {
        req.flash('success', 'Event deleted successfully.');
      }
      res.redirect('/events');
    });
  });
});

// ==========================================
// 4. EVENT TASK CRUD ROUTES
// ==========================================

// Render Add Task Page
app.get('/events/:eventId/tasks/new', checkAuthenticated, (req, res) => {
  const eventId = req.params.eventId;
  const user = req.session.user;

  // Check if event exists and belongs to user
  const eventSql = 'SELECT * FROM events WHERE event_id = ?';
  db.query(eventSql, [eventId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Event not found.');
      return res.redirect('/events');
    }

    if (user.role !== 'admin' && results[0].user_id !== user.id) {
      req.flash('error', 'Access denied.');
      return res.redirect('/events');
    }

    res.render('tasks/add', {
      title: 'Add Event Task',
      event: results[0]
    });
  });
});

// Add Task - Post Route
app.post('/events/:eventId/tasks', checkAuthenticated, (req, res) => {
  const eventId = req.params.eventId;
  const user = req.session.user;
  const { task_name, due_date, assigned_to, cost, status } = req.body;

  if (!task_name || !due_date || !assigned_to || cost === undefined || !status) {
    req.flash('error', 'All fields are required.');
    return res.redirect(`/events/${eventId}/tasks/new`);
  }

  // Owner verification
  const eventSql = 'SELECT * FROM events WHERE event_id = ?';
  db.query(eventSql, [eventId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Event not found.');
      return res.redirect('/events');
    }

    if (user.role !== 'admin' && results[0].user_id !== user.id) {
      req.flash('error', 'Access denied.');
      return res.redirect('/events');
    }

    const sql = 'INSERT INTO event_tasks (event_id, task_name, due_date, assigned_to, cost, status) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [eventId, task_name, due_date, assigned_to, cost, status], (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to add task.');
        return res.redirect(`/events/${eventId}/tasks/new`);
      }

      req.flash('success', 'Task added successfully.');
      res.redirect(`/events/${eventId}`);
    });
  });
});

// Render Edit Task Form
app.get('/tasks/:taskId/edit', checkAuthenticated, (req, res) => {
  const taskId = req.params.taskId;
  const user = req.session.user;

  // Retrieve task and parent event
  const sql = `
    SELECT t.*, e.user_id 
    FROM event_tasks t
    JOIN events e ON t.event_id = e.event_id
    WHERE t.task_id = ?
  `;

  db.query(sql, [taskId], (err, results) => {
    if (err) {
      console.error(err);
      return res.send('Database error');
    }

    if (results.length === 0) {
      req.flash('error', 'Task not found.');
      return res.redirect('/events');
    }

    const task = results[0];

    // Auth check
    if (user.role !== 'admin' && task.user_id !== user.id) {
      req.flash('error', 'Access denied.');
      return res.redirect('/events');
    }

    const formattedDate = new Date(task.due_date).toISOString().split('T')[0];

    res.render('tasks/edit', {
      title: 'Edit Task',
      task,
      formattedDate
    });
  });
});

// Update Task - Post Route
app.post('/tasks/:taskId', checkAuthenticated, (req, res) => {
  const taskId = req.params.taskId;
  const user = req.session.user;
  const { task_name, due_date, assigned_to, cost, status } = req.body;

  if (!task_name || !due_date || !assigned_to || cost === undefined || !status) {
    req.flash('error', 'All fields are required.');
    return res.redirect(`/tasks/${taskId}/edit`);
  }

  // Fetch verification
  const sqlVerify = `
    SELECT t.*, e.user_id 
    FROM event_tasks t
    JOIN events e ON t.event_id = e.event_id
    WHERE t.task_id = ?
  `;

  db.query(sqlVerify, [taskId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Task not found.');
      return res.redirect('/events');
    }

    const task = results[0];
    if (user.role !== 'admin' && task.user_id !== user.id) {
      req.flash('error', 'Access denied.');
      return res.redirect('/events');
    }

    const sqlUpdate = 'UPDATE event_tasks SET task_name = ?, due_date = ?, assigned_to = ?, cost = ?, status = ? WHERE task_id = ?';
    db.query(sqlUpdate, [task_name, due_date, assigned_to, cost, status, taskId], (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to update task.');
        return res.redirect(`/tasks/${taskId}/edit`);
      }

      req.flash('success', 'Task updated successfully!');
      res.redirect(`/events/${task.event_id}`);
    });
  });
});

// Delete Task
app.get('/tasks/:taskId/delete', checkAuthenticated, (req, res) => {
  const taskId = req.params.taskId;
  const user = req.session.user;

  // Retrieve task and parent event for ownership validation
  const sqlVerify = `
    SELECT t.*, e.user_id 
    FROM event_tasks t
    JOIN events e ON t.event_id = e.event_id
    WHERE t.task_id = ?
  `;

  db.query(sqlVerify, [taskId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Task not found.');
      return res.redirect('/events');
    }

    const task = results[0];
    if (user.role !== 'admin' && task.user_id !== user.id) {
      req.flash('error', 'Access denied.');
      return res.redirect('/events');
    }

    const sqlDelete = 'DELETE FROM event_tasks WHERE task_id = ?';
    db.query(sqlDelete, [taskId], (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Failed to delete task.');
      } else {
        req.flash('success', 'Task deleted successfully.');
      }
      res.redirect(`/events/${task.event_id}`);
    });
  });
});

// ==========================================
// 5. ADMIN CONTROL PANEL ROUTES
// ==========================================

// List Users
app.get('/admin/users', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = 'SELECT id, username, email, address, contact, role, created_at FROM users WHERE id != ?';
  db.query(sql, [req.session.user.id], (err, users) => {
    if (err) {
      console.error(err);
      return res.send('Database error loading admin user panel.');
    }

    res.render('admin/users', {
      title: 'User Management',
      users
    });
  });
});

// Update User Role
app.post('/admin/users/:userId/role', checkAuthenticated, checkAdmin, (req, res) => {
  const userId = req.params.userId;
  const { role } = req.body;

  if (role !== 'admin' && role !== 'member') {
    req.flash('error', 'Invalid role selection.');
    return res.redirect('/admin/users');
  }

  const sql = 'UPDATE users SET role = ? WHERE id = ?';
  db.query(sql, [role, userId], (err) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to update user role.');
    } else {
      req.flash('success', 'User role updated successfully.');
    }
    res.redirect('/admin/users');
  });
});

// Delete User
app.get('/admin/users/:userId/delete', checkAuthenticated, checkAdmin, (req, res) => {
  const userId = req.params.userId;

  const sql = 'DELETE FROM users WHERE id = ?';
  db.query(sql, [userId], (err) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to delete user.');
    } else {
      req.flash('success', 'User deleted successfully.');
    }
    res.redirect('/admin/users');
  });
});

// Server Start and Port Conflict Handling
const server = app.listen(PORT, () => {
  console.log(`PlanIt App is running at http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Shut down any other servers, or use an alternative port e.g. set PORT=3001 && node app.js');
    process.exit(1);
  }
  throw error;
});
