const express = require('express');
require('./events');
const app = express();
app.use(express.json());
app.use('/cart', require('./routes/cart'));
app.use('/items', require('./routes/items'));
app.listen(3000);
