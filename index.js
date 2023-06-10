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

        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ token })
        })

        app.get('/courses', async (req, res) => {
            const query = { enrolledStudents: -1 }
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

        app.delete('/selectedcourse/:id', async (req, res) => {
            const selectedCourseId = req.params.id;
            const email = req.query.email
            console.log(selectedCourseId, email);
            const query = { courseId: (selectedCourseId), email: email }
            const result = await selectedCoursesCollection.deleteOne(query);
            res.send(result);
        })

        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(price, amount);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            console.log(paymentIntent);
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);
            const query = { _id: new ObjectId(payment.item) }
            const deletedResult = await selectedCoursesCollection.deleteOne(query)

            res.send({ insertResult, deletedResult });
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