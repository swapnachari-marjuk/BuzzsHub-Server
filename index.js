const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2ic5wod.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.use(cors());
app.use(express.json());

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const bHubDB = client.db("buzzs_hub_db");
    const usersColl = bHubDB.collection("users");
    const clubsColl = bHubDB.collection("clubs");

    // users related apis
    app.post("/users", async (req, res) => {
      const userDoc = req.body;
      const query = { email: userDoc.email };
      const existingUser = await usersColl.findOne(query);
      if (existingUser) {
        return res.send({ message: "User exists in database." });
      }
      const result = await usersColl.insertOne(userDoc);
      res.send(result);
    });

    app.patch("/users", async (req, res) => {
      const { role, email } = req.body;
      const query = { email };
      const update = { role };
      const result = await usersColl.updateOne(query, { $set: update });
      res.send(result);
    });

    // getting a specific user. if it's not usable, it will deleted later
    app.get("/users", async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.email = email;
      }
      const user = await usersColl.find(query).toArray();
      res.send(user);
    });

    app.get("/users/:email/role", async (req, res) => {
      const { email } = req.params;
      const user = await usersColl.findOne({ email });
      const userRole = user?.role;
      res.send({ role: userRole });
    });

    // clubs related apis
    app.post("/clubs", async (req, res) => {
      const clubData = req.body;
      console.log(clubData);
      clubData.createdAt = new Date();
      const result = await clubsColl.insertOne(clubData);
      res.send(result);
    });

    app.get("/clubs", async (req, res) => {
      const { status, email } = req.query;
      console.log(email);
      const query = {};
      if (email) {
        query.managerEmail = email;
      }
      if (status) {
        query.status = status;
      }
      const result = await clubsColl.find(query).toArray();
      res.send(result);
    });

    app.get("/clubs/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await clubsColl.findOne(query);
      console.log(result);
      res.send(result);
    });

    app.patch("/clubs/:id", async (req, res) => {
      const update = req.body;
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await clubsColl.updateOne(query, { $set: update });
      res.send(result);
    });

    app.delete("/clubs/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await clubsColl.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Buzz'sHub is Buzzing.😉");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
