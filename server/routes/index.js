import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import auth from './auth.js';
import settings from './settings.js';
import rooms from './rooms.js';
import halls from './halls.js';
import { hallBookings, roomBookings } from './bookings.js';
import payments from './payments.js';
import supplies from './supplies.js';
import packages from './packages.js';
import whatsapp from './whatsapp.js';
import dashboard from './dashboard.js';
import users, { activity } from './users.js';

const api = Router();

api.use('/auth', auth);
api.use('/settings', settings);

api.use(requireAuth);
api.use('/', dashboard);
api.use('/rooms', rooms);
api.use('/halls', halls);
api.use('/room-bookings', roomBookings);
api.use('/hall-bookings', hallBookings);
api.use('/payments', payments);
api.use('/supplies', supplies);
api.use('/packages', packages);
api.use('/whatsapp', whatsapp);
api.use('/users', requireAdmin, users);
api.use('/activity', requireAdmin, activity);

api.use((req, res) => res.status(404).json({ error: 'Not found' }));

export default api;
