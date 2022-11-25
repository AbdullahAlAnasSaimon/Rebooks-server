const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) =>{
  res.send('rebooks server is running.');
})

const uri = `mongodb+srv://${process.env.REBOOKS_DB}:${process.env.DB_USER_PASS}@cluster0.jt8oxuk.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run(){
  try{
    const usersCollection = client.db('rebooksDb').collection('users');

    app.post('/users', async(req, res) =>{
      const user = req.body;
      console.log(user);
      const query = {email: user.email};
      const alreadyExist = await usersCollection.find(query).toArray();
      if(alreadyExist.length){
        return res.send({acknowledged: false});
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })
  }
  finally{

  }
}
run().catch(err => console.log(err));

app.listen(port, () => {
  console.log('rebooks server is running on port: ', port);
})
