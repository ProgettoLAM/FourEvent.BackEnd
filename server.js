var express = require('express');
var fs = require('fs');
var app = express();
var ms = require('ms');

var bodyParser  = require('body-parser');
var morgan      = require('morgan');

// driver mongo
var MongoClient = require('mongodb').MongoClient;

// per autenticazione e token
var jwt    = require('jsonwebtoken');

//file di config con la passphrase e database
var config = require('./config');

//porta settata
var port = process.env.PORT || 3000;

var cheerio = require('cheerio');

//connessione al database e set della passphrase
//mongoose.connect(config.database);
app.set('superSecret', config.secret);

// setta il body parser per leggere il json delle richieste POST
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// logger
app.use(morgan('dev'));

/*
 * apiRoutes è la variabile che fa riferimento al routing
 *
 */
var apiRoutes = express.Router();

/*
 * effettua l'autenticazione dell'utente, con email e password
 * se l'autenticazione è corretta ritorna un token da utilizzare per le api
 */
apiRoutes.post('/authenticate', function(req, res) {

    MongoClient.connect(config.database, function(err, db) {

        db.collection('users').find({'email':req.body.email}).toArray(function(err, docs) {

            if(err) throw err;

            user = docs[0];

            if(!user){

                res.status(403).send({success: false, message: 'Autenticazione fallita, email non trovata.'});
            }
            else{

                if(user.pass !== req.body.password){

                    res.status(403).send({success: false, message: 'Autenticazione fallita, password errata.'});
                }
                else{

                    var token = jwt.sign(
                        user,
                        app.get('superSecret'),
                        {
                            expiresIn: ms('1w') //expiration 1 settimana
                        }
                    );

                    console.log(token);

                    res.json({
                        success: true,
                        message: 'Bentornato '+user.given_name+' '+ user.family_name,
                        token: token
                    });
                }
            }

            db.close();
        });
    });
});

/*
 * ogni url per accedere ad una risorsa è condificato con un /api davanti
 *
 */
app.use('/api', apiRoutes);


/*
 * mette il server in ascolto sulla porta 3000
 *
 */
app.listen(port, function () {
  	console.log('Example app listening on http://localhost:'+port);
});
