const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2ic5wod.mongodb.net/?appName=Cluster0`;

const stripe = require("stripe")(process.env.STRIPE_KEY);

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
    const eventsColl = bHubDB.collection("events");
    const clubMembersColl = bHubDB.collection("clubMembers");

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
      const { status, email, limit } = req.query;
      console.log(email);
      const query = {};
      if (email) {
        query.managerEmail = email;
      }
      if (status) {
        query.status = status;
      }
      if (limit) {
        const limitedResult = await clubsColl
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        return res.send({
          message: "data fetched successfully.",
          limitedResult,
        });
      }
      const result = await clubsColl.find(query).toArray();
      res.send(result);
    });

    app.get("/clubs/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await clubsColl.findOne(query);
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

    // events related apis
    app.post("/events/:clubID", async (req, res) => {
      const { clubID } = req.params;
      const event = req.body;
      event.clubID = clubID;
      const result = await eventsColl.insertOne(event);

      const countIncRes = await clubsColl.updateOne(
        {
          _id: new ObjectId(clubID),
        },
        {
          $inc: { eventCount: 1 },
        }
      );
      res.send({ success: true, result, countIncRes });
    });

    app.get("/events", async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.managerEmail = email;
      }
      const result = await eventsColl.find(query).toArray();
      res.send(result);
    });

    app.get("/events/:eventID", async (req, res) => {
      const { eventID } = req.params;

      const query = { _id: new ObjectId(eventID) };
      const result = await eventsColl.findOne(query);
      res.send(result);
    });

    app.patch("/events/:eventId", async (req, res) => {
      const { eventId } = req.params;
      const query = { _id: new ObjectId(eventId) };
      const update = { $set: req.body };
      const result = await eventsColl.updateOne(query, update);
      res.send(result);
    });

    app.delete("/events/:eventId", async (req, res) => {
      const { eventId } = req.params;
      const query = { _id: new ObjectId(eventId) };
      const result = await eventsColl.deleteOne(query);
      res.send(result);
    });

    // club members related apis
    app.post("/clubMembers", async (req, res) => {
      const doc = req.body;
      doc.joinedAt = new Date();
      const userEmail = doc.userEmail;
      const clubId = doc.clubId;
      const joinedUser = await clubMembersColl.findOne({
        userEmail,
        clubId,
      });

      if (joinedUser) {
        return res.send({ message: "User already joined to this Club." });
      }

      const result = await clubMembersColl.insertOne(doc);
      res.send(result);
    });

    app.get("/clubMembers", async (req, res) => {
      const { clubId, userEmail } = req.query;
      const query = {};

      if (clubId) {
        query.clubId = clubId;
      }
      if (userEmail) {
        query.userEmail = userEmail;
      }
      const result = await clubMembersColl.findOne(query);
      res.send(result);
    });

    // payments related apis
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const cost = parseInt(paymentInfo.fee) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              product_data: {
                name: paymentInfo.clubName,
              },
              unit_amount: cost,
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.participantEmail,
        mode: "payment",
        metadata: {
          clubId: paymentInfo.clubId,
          clubName: paymentInfo.clubName,
          userEmail: paymentInfo.participantEmail,
        },
        success_url: `${process.env.SITE_DOMAIN}/success-club-payment?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/canceled-club-payment?session_id={CHECKOUT_SESSION_ID}`,
      });
      res.send({ url: session.url });
    });

    app.post("/verify-payment-session", async (req, res) => {
      const { sessionId } = req.query;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid") {
        const memberShipInfo = {
          clubName: session.metadata.clubName,
          clubId: session.metadata.clubId,
          userEmail: session.metadata.userEmail,
          status: "active",
          paymentId: session.payment_intent,
          joinedAt: new Date(),
        };

        const existingMember = await clubMembersColl.findOne({
          clubId: memberShipInfo.clubId,
          userEmail: memberShipInfo.userEmail,
        });

        if (existingMember) {
          return res.send({ message: "User already existing!" });
        }

        const result = await clubMembersColl.insertOne(memberShipInfo);

        res.send(result);
      }
      res.send({ message: "Maybe Payment was not succeed" });
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
