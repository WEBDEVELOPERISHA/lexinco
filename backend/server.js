const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'https://lexinco-dbd9de732777.herokuapp.com', 'https://lexinco.com', 'https://www.lexinco.com'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// Serve under-construction.html for all routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'under-construction.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});