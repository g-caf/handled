import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import expressLayouts from 'express-ejs-layouts';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import cartRoutes from './routes/cart.js';
import dashboardRoutes from './routes/dashboard.js';
import sessionsRoutes from './routes/sessions.js';
import importRoutes from './routes/import.js';
import shopRoutes from './routes/shop.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PgSession = connectPgSimple(session);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: env.NODE_ENV === 'production',
  },
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use(cartRoutes);
app.use(dashboardRoutes);
app.use(sessionsRoutes);
app.use(importRoutes);
app.use(shopRoutes);

app.get('/', (req, res) => {
  res.render('index');
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send(`Error: ${err.message}`);
});

app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});
