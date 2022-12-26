const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { query } = require('express');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('rebooks server is running.');
})

const uri = `mongodb+srv://${process.env.REBOOKS_DB}:${process.env.DB_USER_PASS}@cluster0.jt8oxuk.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


// middleware for jwt token verification
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'forbidden access' })
    }
    req.decoded = decoded;
    next();
  })
}


async function run() {
  try {
    const usersCollection = client.db('rebooksDb').collection('users');
    const categoriesCollection = client.db('rebooksDb').collection('categories');
    const productsCollection = client.db('rebooksDb').collection('products');
    const bookedProductsCollection = client.db('rebooksDb').collection('bookedProduct');
    const paymentCollection = client.db('rebooksDb').collection('payment');
    const wishListCollection = client.db('rebooksDb').collection('wishlist');


    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail }
      const admin = await usersCollection.findOne(query);

      if (admin?.role !== 'Admin') {
        res.status(403).send({ message: 'forbidden access' })
      }

      next();
    }

    const verifySeller = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail }
      const seller = await usersCollection.findOne(query);

      if (seller?.role !== 'Seller') {
        res.status(403).send({ message: 'forbidden access' })
      }

      next();
    }

    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const product = req.body;
      const price = product.product_price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        "payment_method_types": [
          "card"
        ],

      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })

    app.post('/payment', verifyJWT, async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);

      // update info to booked product collection
      const bookedProductId = payment.bookedId;
      const bookedFilter = { _id: ObjectId(bookedProductId) };
      const bookedUpdatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId
        }
      }
      const updateBooked = await bookedProductsCollection.updateOne(bookedFilter, bookedUpdatedDoc);

      // update info to product collection
      const id = payment.productID;
      const productFilter = { _id: ObjectId(id) };
      const UpdatedDoc = {
        $set: {
          paid: true,
          advertisement: false
        }
      }
      const updateProduct = await productsCollection.updateOne(productFilter, UpdatedDoc);
      res.send(result);
    })

    // api for jwt
    app.get('/jwt', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '20d' });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: '' });
    })

    // get all sellers (Admin access)
    app.get('/users/all-seller', verifyJWT, verifyAdmin, async (req, res) => {
      const query = { role: 'Seller' };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    })

    // get all buyers (Admin access)
    app.get('/users/all-buyer', verifyJWT, verifyAdmin, async (req, res) => {
      const query = { role: 'Buyer' };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    })

    // 
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const alreadyExist = await usersCollection.find(query).toArray();
      if (alreadyExist.length) {
        return res.send({ acknowledged: false });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    app.get('/users/only-sellers', async (req, res) => {
      const query = { role: 'Seller' };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    })

    app.put('/users/:email', async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const sellerFilter = { seller_email: email }
      const option = { upsert: true };
      const updatedDoc = {
        $set: {
          verified: true
        }
      }

      const result = await usersCollection.updateOne(filter, updatedDoc, option);
      const updatedResult = await productsCollection.updateMany(sellerFilter, updatedDoc, option);
      res.send(result);
    })

    // find user by email query
    app.get('/users', async (req, res) => {
      const email = req.query.email;
      const filter = { email: email }
      const result = await usersCollection.findOne(filter);
      res.send(result);
    })

    // delete seller by admin
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })

    // 
    app.get('/category', async (req, res) => {
      const query = {};
      const result = await categoriesCollection.find(query).toArray();
      res.send(result);
    })

    // get products by category id
    app.get('/category/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { categoryId: id };
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    })

    // get all products
    app.get('/products', verifyJWT, async (req, res) => {
      const query = {};
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/advertise', async (req, res) => {
      const query = { advertisement: true };
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    })

    // post products
    app.post('/products', verifyJWT, verifySeller, async (req, res) => {
      const book = req.body;
      const result = await productsCollection.insertOne(book);
      res.send(result);
    })

    // modifiyng products
    app.put('/products/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const option = { upsert: true }
      const updatedDoc = {
        $set: {
          advertisement: true
        }
      }
      const result = await productsCollection.updateOne(filter, updatedDoc, option)
      res.send(result);
    })

    app.put('/reported-product/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const option = { upsert: true };
      const updatedDoc = {
        $set: {
          report: true
        }
      }
      const result = await productsCollection.updateOne(filter, updatedDoc, option);
      res.send(result);
    })

    app.get('/reported-product', verifyJWT, async (req, res) => {
      const query = { report: true };
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    })

    // delete product
    app.delete('/products/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/my-products', verifyJWT, verifySeller, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        res.status(403).send({ message: 'forbidden access' })
      }

      const query = { seller_email: email };
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/my-buyers', async(req, res) =>{
      const email = req.query.email;
      const query = {seller_email: email};
      const result = await bookedProductsCollection.find(query).toArray();
      res.send(result);
    })

    // my orders product
    app.post('/my-orders', async (req, res) => {
      const product = req.body;
      const result = await bookedProductsCollection.insertOne(product);
      const id = req.body.productID;
      const filter = { _id: ObjectId(id) };
      const wishDataFilter = {productID: id};
      const updatedDoc = {
        $set: {
          availablity: false,
        }
      };
      const updateWishListResult = await wishListCollection.updateOne(wishDataFilter, updatedDoc);
      const updateResult = await productsCollection.updateOne(filter, updatedDoc)
      res.send(result);
    })

    app.get('/my-orders', async (req, res) => {
      const email = req.query.email;
      const query = { user_email: email };
      const result = await bookedProductsCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/my-orders/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await bookedProductsCollection.findOne(query);
      res.send(result);
    })

    app.delete('/my-orders/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const getData = await bookedProductsCollection.findOne(query);
      
      const productQuery = { _id: ObjectId(getData?.productID) };
      const wishProductQuery = {productID: getData?.productID};
      const updatedDoc = {
        $set: {
          availablity: true
        }
      }
      const productResult = await productsCollection.updateOne(productQuery, updatedDoc);
      const wishProductResult = await wishListCollection.updateOne(wishProductQuery, updatedDoc);
      const result = await bookedProductsCollection.deleteOne(query);
      res.send(result);

    })

    app.post('/add-to-wishlist', async(req, res) =>{
      const wishListData = req.body;

      const query = {user_email: req.body.user_email, productID: req.body.productID}
      const result = await wishListCollection.findOne(query);
      if((req.body.productID === result?.productID) && (req.body.user_email === result?.user_email)){
        return res.send({message: 'Product Already In Wishlist'});
      }
      else{
        const insertResult = await wishListCollection.insertOne(wishListData);
        res.send(insertResult);
      }
    })

    app.get('/add-to-wishlist', async(req, res) =>{
      const email = req.query.email;
      const query = {user_email: email}
      const result = await wishListCollection.find(query).toArray();
      res.send(result);
    })

    app.delete('/add-to-wishlist/:id', async(req, res) =>{
      const id = req.params.id;
      const query = {_id: ObjectId(id)};
      const result = await wishListCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/sold-products', async (req, res) =>{
      const query = {paid: true};
      const result = await productsCollection.find(query).toArray();
      res.send(result);
    })

    // check user admin
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user.role === 'Admin' })
    })

    // check user seller
    app.get('/users/seller/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isSeller: user?.role === 'Seller' })
    })

    // check user buyer
    app.get('/users/buyer/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isBuyer: user?.role === 'Buyer' })
    })

  }
  finally {

  }
}
run().catch(err => console.log(err));

app.listen(port, () => {
  console.log('rebooks server is running on port: ', port);
})
