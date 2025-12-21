const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2ic5wod.mongodb.net/?appName=Cluster0`;

const stripe = require("stripe")(process.env.STRIPE_KEY);

var admin = require("firebase-admin");

var serviceAccount = require("./buzzs-hub-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.use(cors());
app.use(express.json());
const verifyFBToken = async (req, res, next) => {
  const bearer = req.headers.authorization;
  if (!bearer) {
    return res.status(401).send({ message: "Unauthorized request!" });
  }

  try {
    const token = bearer.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    console.log(decoded);
  } catch (error) {
    console.log(error);
    return res.status(401).send({ message: "Unauthorized access!🤚" });
  }

  next();
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const bHubDB = client.db("buzzs_hub_db");
    const usersColl = bHubDB.collection("users");
    const clubsColl = bHubDB.collection("clubs");
    const eventsColl = bHubDB.collection("events");
    const clubMembersColl = bHubDB.collection("clubMembers");
    const eventRegistersColl = bHubDB.collection("eventRegister");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersColl.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access." });
      }
      next();
    };

    const verifyManager = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersColl.findOne(query);
      if (user?.role !== "manager") {
        return res.status(403).send({ message: "Forbidden access." });
      }
      next();
    };

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

    app.patch("/users", verifyFBToken, async (req, res) => {
      const { role, email } = req.body;
      const query = { email };
      const update = { role };
      if (role === "user") {
        const userRes = await usersColl.updateOne(query, { $set: update });
        return res.send(userRes);
      }
      const result = await usersColl.updateOne(query, { $set: update });
      res.send(result);
    });

    // getting a specific user. if it's not usable, it will deleted later
    app.get("/users", verifyFBToken, async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.email = email;
      }
      const user = await usersColl.find(query).toArray();
      res.send(user);
    });

    app.get("/users/:email/role", verifyFBToken, async (req, res) => {
      const { email } = req.params;
      const user = await usersColl.findOne({ email });
      const userRole = user?.role;
      res.send({ role: userRole });
    });

    // clubs related apis
    app.post("/clubs", verifyFBToken, verifyManager, async (req, res) => {
      const clubData = req.body;
      console.log(clubData);
      clubData.createdAt = new Date();
      const result = await clubsColl.insertOne(clubData);
      res.send(result);
    });

    app.get("/clubs", async (req, res) => {
      const { status, email, limit, purpose } = req.query;
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

      if (purpose === "managerOverview") {
        const overviewRes = await clubsColl
          .find(query)
          .project({ _id: 1, clubName: 1 })
          .toArray();

        return res.send(overviewRes);
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

    app.patch("/clubs/:id", verifyFBToken, async (req, res) => {
      const update = req.body;
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await clubsColl.updateOne(query, { $set: update });
      res.send(result);
    });

    // events related apis
    app.post(
      "/events/:clubID",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const { clubID } = req.params;
        const event = req.body;
        event.clubID = clubID;
        const result = await eventsColl.insertOne(event);

        if (result.insertedId) {
          const countIncRes = await clubsColl.updateOne(
            {
              _id: new ObjectId(clubID),
            },
            {
              $inc: { eventCount: 1 },
            }
          );
        }
        res.send({ success: true, result, countIncRes });
      }
    );

    app.get("/events", async (req, res) => {
      const { email, purpose } = req.query;
      const query = {};
      if (email) {
        query.managerEmail = email;
      }

      if (purpose === "managerOverview") {
        const minimizedRes = await eventsColl
          .find(query)
          .project({ title: 1 })
          .toArray();

        return res.send(minimizedRes);
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

    app.get("/member-upcoming-events", verifyFBToken, async (req, res) => {
      const { email } = req.query;
      const now = new Date();

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      const joinedClubs = await clubMembersColl
        .find({ participantEmail: email, status: "active" })
        .project({ clubId: 1, _id: 0 })
        .toArray();

      const clubIds = joinedClubs.map((club) => club.clubId);

      const query = {
        clubID: { $in: clubIds },
        date: { $gte: now.toISOString() },
      };

      const result = await eventsColl.find(query).sort({ date: -1 }).toArray();
      res.send(result);
    });

    app.patch(
      "/events/:eventId",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const { eventId } = req.params;
        const query = { _id: new ObjectId(eventId) };
        const update = { $set: req.body };
        const result = await eventsColl.updateOne(query, update);
        res.send(result);
      }
    );

    app.delete(
      "/events/:eventId",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const { eventId } = req.params;
        const query = { _id: new ObjectId(eventId) };
        const result = await eventsColl.deleteOne(query);
        res.send(result);
      }
    );

    // club members related apis
    app.post("/clubMembers", verifyFBToken, async (req, res) => {
      const doc = req.body;
      doc.joinedAt = new Date();
      const participantEmail = doc.participantEmail;
      const clubId = doc.clubId;
      const joinedUser = await clubMembersColl.findOne({
        participantEmail,
        clubId,
      });

      if (joinedUser) {
        return res.send({ message: "User already joined to this Club." });
      }

      const result = await clubMembersColl.insertOne(doc);
      if (result.insertedId) {
        await clubsColl.updateOne(
          { _id: new ObjectId(clubId) },
          { $inc: { memberCount: 1 } }
        );
      }
      res.send(result);
    });

    app.get("/clubMembers", verifyFBToken, async (req, res) => {
      const { clubId, participantEmail, status, purpose } = req.query;
      const query = {};

      if (clubId) {
        query.clubId = clubId;
      }
      if (participantEmail) {
        query.participantEmail = participantEmail;
      }

      if (status) {
        query.status = status;
      }

      if (purpose === "isExisting") {
        const result = await clubMembersColl.findOne(query);
        return res.send(result);
      }
      const result = await clubMembersColl.find(query).toArray();
      res.send(result);
    });

    app.patch("/memberExpired/:memberId", verifyFBToken, async (req, res) => {
      const { memberId } = req.params;
      const update = req.body;
      const query = { _id: new ObjectId(memberId) };
      const result = await clubMembersColl.updateOne(query, { $set: update });
      res.send(result);
    });

    // event registration related apis
    app.post("/eventRegistration", verifyFBToken, async (req, res) => {
      const doc = req.body;
      doc.joinedAt = new Date();
      const participantEmail = doc.participantEmail;
      const clubId = doc.clubId;
      const joinedUser = await eventRegistersColl.findOne({
        participantEmail,
        clubId,
      });

      if (joinedUser) {
        return res.send({ message: "User already joined to this Club." });
      }

      const result = await eventRegistersColl.insertOne(doc);
      res.send(result);
    });

    app.get("/eventRegistration", verifyFBToken, async (req, res) => {
      const { eventId, participantEmail, purpose } = req.query;
      const query = {};

      if (eventId) {
        query.eventId = eventId;
      }

      if (participantEmail) {
        query.participantEmail = participantEmail;
      }

      if (purpose === "isExisting") {
        const result = await eventRegistersColl.findOne(query);
        return res.send(result);
      }

      const result = await eventRegistersColl.find(query).toArray();
      res.send(result);
    });

    // payments related apis
    app.post("/create-checkout-session", verifyFBToken, async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo, "payment info from checkout session.");
      const cost = parseInt(paymentInfo.fee) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              product_data: {
                name: paymentInfo.clubName || paymentInfo.eventName,
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
          eventId: paymentInfo.eventId || null,
          clubName: paymentInfo.clubName || null,
          eventName: paymentInfo.eventName || null,
          participantEmail: paymentInfo.participantEmail,
          paymentType: paymentInfo.paymentType,
          eventManager: paymentInfo.eventManager,
        },
        success_url: `${process.env.FRONTEND_DOMAIN}/success-club-payment?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_DOMAIN}/canceled-club-payment?session_id={CHECKOUT_SESSION_ID}`,
      });
      res.send({ url: session.url });
    });

    app.post("/verify-payment-session", verifyFBToken, async (req, res) => {
      const { sessionId } = req.query;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log(session);
      if (session.payment_status === "paid") {
        if (session.metadata.paymentType === "clubMembership") {
          const memberShipInfo = {
            clubName: session.metadata.clubName,
            clubId: session.metadata.clubId,
            participantEmail: session.metadata.participantEmail,
            status: "active",
            paymentId: session.payment_intent,
            joinedAt: new Date(),
          };

          const existingMember = await clubMembersColl.findOne({
            clubId: memberShipInfo.clubId,
            participantEmail: memberShipInfo.participantEmail,
          });

          if (existingMember) {
            return res.send({ message: "User already existing!" });
          }

          const result = await clubMembersColl.insertOne(memberShipInfo);

          if (result.insertedId) {
            await clubsColl.updateOne(
              { _id: new ObjectId(memberShipInfo.clubId) },
              { $inc: { memberCount: 1 } }
            );
          }

          return res.send({ result, paymentId: memberShipInfo.paymentId });
        }

        if (session.metadata.paymentType === "eventRegistration") {
          const registrationInfo = {
            eventId: session.metadata.eventId,
            clubId: session.metadata.clubId,
            eventName: session.metadata.eventName,
            participantEmail: session.metadata.participantEmail,
            eventManager: session.metadata.eventManager,
            status: "active",
            paymentId: session.payment_intent,
            joinedAt: new Date(),
          };

          const existingMember = await eventRegistersColl.findOne({
            eventId: registrationInfo.eventId,
            participantEmail: registrationInfo.participantEmail,
          });

          if (existingMember) {
            return res.send({ message: "User already existing!" });
          }

          const result = await eventRegistersColl.insertOne(registrationInfo);

          return res.send({ result, paymentId: registrationInfo.paymentId });
        }
      }
      res.send({ message: "Maybe Payment was not succeed" });
    });

    //admin overview apis
    app.get("/adminOverview", verifyFBToken, verifyAdmin, async (req, res) => {
      const eventsCountPromise = eventsColl.countDocuments();
      const usersCountPromise = usersColl.countDocuments();
      const membersCountPromise = clubMembersColl.countDocuments();
      const clubsByStatusPromise = clubsColl
        .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
        .toArray();

      const [eventsCount, usersCount, membersCount, clubsByStatus] =
        await Promise.all([
          eventsCountPromise,
          usersCountPromise,
          membersCountPromise,
          clubsByStatusPromise,
        ]);

      const result = {
        eventsCount,
        usersCount,
        membersCount,
        clubsByStatus,
      };

      res.send(result);
    });

    // manager overview apis
    app.get(
      "/managerOverview",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const { managerEmail, clubId } = req.query;
        const query = {};
        if (managerEmail) {
          query.managerEmail = managerEmail;
        }

        const managersClubsPromise = clubsColl.countDocuments(query);
        const managersEventsPromise = eventsColl.countDocuments(query);

        const [managersClubs, managersEvents] = await Promise.all([
          managersClubsPromise,
          managersEventsPromise,
        ]);

        const result = {
          managersClubs,
          managersEvents,
        };

        res.send(result);
      }
    );

    // user overview api
    app.get("/memberOverview", verifyFBToken, async (req, res) => {
      const { memberEmail } = req.query;
      const query = {};
      if (memberEmail) {
        query.participantEmail = memberEmail;
      }

      const membersClubPromise = clubMembersColl.countDocuments(query);
      const membersEventsPromise = eventRegistersColl.countDocuments(query);

      const [membersClub, membersEvents] = await Promise.all([
        membersClubPromise,
        membersEventsPromise,
      ]);

      const result = {
        membersClub,
        membersEvents,
      };

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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
