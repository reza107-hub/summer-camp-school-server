const express = require('express');
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5000
const jwt = require('jsonwebtoken');
const app = express()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors())
app.use(express.json())


const stripe = require('stripe')(process.env.ACCESS_Payment_key)

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tfxumrl.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const courseCollections = client.db('campSporty').collection('courses')

        const instructorCollections = client.db('campSporty').collection('instructors')

        const selectedCoursesCollection = client.db('campSporty').collection('selectedCourses')

        const paymentCollection = client.db("campSporty").collection("payments");
        const usersCollection = client.db("campSporty").collection("users");

        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ token })
        })


        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })

        app.get('/users/instructor/:email', async (req, res) => {
            const email = req.params.email;

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        })


        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        })

        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        })

        app.get('/courses', async (req, res) => {
            const query = { availableSeats: 1 }
            const result = await courseCollections.find().sort(query).toArray()
            res.send(result)
        })

        app.get('/instructors', async (req, res) => {
            const result = await instructorCollections.find().toArray()
            res.send(result)
        })

        app.get('/selectedcourse', async (req, res) => {
            const email = req.query.email
            const result = await selectedCoursesCollection.find({ email }).toArray()
            res.send(result)
        })

        app.get('/payments', async (req, res) => {
            const query = { email: req.query.email }
            const Result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
            res.send(Result);
        })

        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.post('/courses', async (req, res) => {
            const body = req.body
            const result = await courseCollections.insertOne(body)
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }
            const result = await usersCollection.insertOne(req.body)
            res.send(result)
        })


        app.post('/selectedcourse', async (req, res) => {
            const { email, ...course } = req.body;

            const existingRecord = await selectedCoursesCollection.findOne({
                email: email,
                courseId: course._id,
            });

            if (existingRecord) {
                return res.status(401).send({
                    error: true,
                    message: 'User has already enrolled in this course.'
                });
            }
            const result = await selectedCoursesCollection.insertOne({
                email: email,
                courseId: course._id,
                courseName: course?.courseName,
                enrolledStudents: course?.enrolledStudents,
                price: course?.price,
                availableSeats: course?.availableSeats,
                instructorId: course?.instructorId,
                instructorName: course?.instructorName,
                courseImage: course?.courseImage
            });
            res.send(result)
        })


        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);
            const query = { _id: new ObjectId(payment.item) }
            const deletedResult = await selectedCoursesCollection.deleteOne(query)

            const filter = { _id: new ObjectId(payment?.courseId) }

            const updateDoc = {
                $inc: { availableSeats: -1, enrolledStudents: 1 }
            };

            const updateResult = await courseCollections.updateOne(filter, updateDoc)

            res.send({ insertResult, deletedResult, updateResult });
        })


        app.delete('/selectedcourse/:id', async (req, res) => {
            const selectedCourseId = req.params.id;
            const email = req.query.email
            const query = { courseId: (selectedCourseId), email: email }
            const result = await selectedCoursesCollection.deleteOne(query);
            res.send(result);
        })

        app.patch('/courses/:id', async (req, res) => {
            const id = req.params.id;
            const status = req.query.status
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: status
                },
            };
            const result = await courseCollections.updateOne(filter, updateDoc);
            res.send(result);

        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('hello campSporty')
})

app.listen(port)