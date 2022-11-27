const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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

    // api for jwt
    app.get('/jwt', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
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
    app.post('/users', verifyJWT, async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const alreadyExist = await usersCollection.find(query).toArray();
      if (alreadyExist.length) {
        return res.send({ acknowledged: false });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    // 
    app.get('/category', verifyJWT, async (req, res) => {
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

    // post products
    app.post('/products', verifyJWT, verifySeller, async (req, res) => {
      const book = req.body;
      const result = await productsCollection.insertOne(book);
      res.send(result);
    })

    // modifiyng products
    app.put('/products/:id', async (req, res) => {
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
