var express = require('express');
var fs = require('fs');
var app = express();
var ms = require('ms');
var assert = require('assert');
var colors = require('colors');
var sha256 = require('sha256');
var geocoder = require('geocoder');
var multer = require('multer');


var bodyParser  = require('body-parser');
var morgan      = require('morgan');

// driver mongo
var mongo = require('mongodb');
var MongoClient = mongo.MongoClient;

// per autenticazione e token
var jwt    = require('jsonwebtoken');

//file di config con la passphrase e database
var config = require('./config');

//porta settata
var port = process.env.PORT || 8080;
var url = process.env.URI || config.url;

url += port;

//connessione al database e set della passphrase
//mongoose.connect(config.database);
app.set('superSecret', config.secret);

// setta il body parser per leggere il json delle richieste POST
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// logger
app.use(morgan('dev'));

var upload = multer({ dest: __dirname+'/data/img/'});
var apiRoutes = express.Router();

var db;

MongoClient.connect(config.database, function(err, database) {
        db = database;
});

//EVENT-------------------------------------------------------------------------

function checkParticipation(result,email) {

    for(var i=0; i<result.length; i++) {

        result[i].participate = false;
        var users = result[i].user_participations;

        for(var j=0; j<users.length; j++) {

            if(email === users[j]) {

                result[i].participate = true;
            }
        }
    }

    return result;
}


apiRoutes.get('/event/:email', function(req, res) {

    var cond, project;
    switch (req.query.type) {
        case "near":

            var lng = req.query.lng,
                lat = req.query.lat;

            if(lng && lat) {

                cond = [
                    {
                        "$geoNear": {
                            "near": {
                                 "type": "Point",
                                 "coordinates": [parseFloat(lng), parseFloat(lat)]
                             },
                             "distanceField": "distance",
                             "maxDistance": 5000,
                             "spherical": true,
                             "query": { "loc.type": "Point" }
                         }
                    },
                    {
                         "$sort": {"distance": 1} // Sort the nearest first
                    }
                ];

                db.collection('events').aggregate(cond,function(err,result) {

                    if(err) return handleError(err,500,res);

                    if(result.length === 0) return handleError({'message':'Eventi non trovati'},404,res);

                    res.send(checkParticipation(result,req.params.email));
                });

            } else
                return handleError({'message':'Forbidden'},406,res);

            break;

        case "category":

            cond = {'_id':req.params.email};
            project = {'categories.name':1,'_id':0};
            db.collection('users').findOne(cond,project,function(err, result) {

                if(err) return handleError(err,500,res);

                var tmpCat = [];
                for(var i=0; i<result.categories.length; i++) {

                    tmpCat.push(result.categories[i].name);
                }

                cond = {'tag':{'$in':tmpCat}};
                db.collection('events').find(cond).toArray(function(err, result) {

                    if(err) return handleError(err,500,res);

                    if(result.length === 0) return handleError({'message':'Eventi non trovati!'},404,res);

                    res.send(checkParticipation(result,req.params.email));
                });
            });
            break;

        case "popular":

            return handleError({'message':'Non ci sono eventi popolari'},404,res);

        default:
            return handleError({'message':'tipo non trovato'},404,res);
    }
});

apiRoutes.get('/event/img/:event_id',function(req, res) {

    var cond = {'_id':mongo.ObjectID(req.params.event_id)};
    var project = {'image':true,'_id':false};
    db.collection('events').findOne(cond,project,function(err, result) {

        if(err) return handleError(err,500,res);

        res.sendFile(__dirname+'/data/img/'+result.image);
    });
});


apiRoutes.put('/event/', function(req, res) {

    var cond, update, body = req.body;

    geocoder.geocode(body.address, function ( err, data ) {

        if(err) return handleError(err,500,res);

        var event = {

            'title' : body.title,
            'tag' : body.tag,
            'description' : body.description,
            'start_date' : body.start_date,
            'user_participations' : [],
            'image' : body.image,
            'loc':{
                type: "Point",
                coordinates: [
                    data.results[0].geometry.location.lng,
                    data.results[0].geometry.location.lat
                ]
            },
            'author' : body.author,
            'price' : "FREE"
        };

        data.results[0].address_components.forEach(function(component) {

            if(component.types[0] === 'locality') {

                event.address = component.short_name;
                console.log(event.address);
            }
        });

        if(body.end_date) event.end_date = body.end_date;
        if(body.tickets) event.tickets = body.tickets;
        if(body.price) event.price = body.price;

        db.collection('events').insertOne(event,function(err,result) {

            if(err) return handleError(err,500,res);

            cond = {'_id':event.author};
            update = {'$push': {'events': event._id}};
            db.collection('planners').updateOne(cond,update,function(err,result){

                if(err) return handleError(err,500,res);

                res.send(event);
            });
        });
    });
});

apiRoutes.put('/event/img',upload.single('file'), function(req, res) {

    var array = req.file.originalname.split('.');
    var ext = '.' + array[array.length-1];
    var name = new Date().getTime()+ext;

    var file = __dirname + '/data/img/' + name;
    fs.rename(req.file.path, file, function(err) {

        if(err) return handleError(err,500,res);

        res.send({'filename':name});
    });
});


apiRoutes.post('/event/participate/:event_id', function(req, res) {

    var condition,update;

    condition = {'_id':mongo.ObjectID(req.params.event_id)};
    update = {'$addToSet': {'user_participations':req.body.email}};
    db.collection('events').updateOne(condition,update,function(err,result) {

        if(err) return handleError(err,500,res);

        if(result.result.nModified === 0)
            return handleError({'message':'Partecipi già a questo evento'},403,res);

        condition = [{'$match' : condition},{'$project': {'participations': { $size: "$user_participations" }}}];
        db.collection('events').aggregate(condition, function(err, result) {

            result[0].message = 'Evvai!, adesso partecipi a questo evento!';
            res.send(result[0]);
        });
    });
});

apiRoutes.post('/event/notparticipate/:event_id', function(req, res) {

    var condition,update;

    condition = {'_id':mongo.ObjectID(req.params.event_id)};
    update = {'$pull': {'user_participations':req.body.email}};
    db.collection('events').updateOne(condition,update,function(err,result) {

        if(err) return handleError(err,500,res);

        if(result.result.nModified === 0)
            return handleError({'message':"Errore, non partecipi all'evento"},406,res);

        condition = [{'$match' : condition},{'$project': {'participations': { $size: "$user_participations" }}}];
        db.collection('events').aggregate(condition, function(err, result) {

            result[0].message = 'Non partecipi più a questo evento!';
            res.send(result[0]);
        });
    });
});


apiRoutes.delete('/event/:email/:id', function(req, res) {

    var cond,update;

    cond = {'_id':req.params.email};
    update = {'$pull':{'events':mongo.ObjectID(req.params.id)}};
    db.collection('planners').updateOne(cond,update,function(err, result) {

        if(err) return handleError(err,500,res);

        cond = {'_id': mongo.ObjectID(req.params.id)};
        db.collection('events').removeOne(cond,function(err,result) {

            if(err) return handleError(err,500,res);

            if(result.result.n === 0) return handleError({'message':'Evento non trovato'},404,res);

            res.send({'message':'Evento eliminato'});
        });
    });
});

//USER--------------------------------------------------------------------------

apiRoutes.get('/user',function(req,res){

    db.collection('users').find().toArray(function(err, result) {

        if(err) return handleError(err,500,res);

        res.send(result);
    });
});

apiRoutes.get('/user/:email',function(req,res){

    var cond = {'_id':req.params.email};
    db.collection('users').findOne(cond,function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result.length)
            return handleError({'message':'Utente non trovato'},404,res);

        res.send(result);
    });
});

apiRoutes.get('/user/img/:user_id',function(req, res) {

    console.log(req.params.user_id);

    MongoClient.connect(config.database, function(err, db) {

        if(err) return res.status(500).send(err);

        db.collection('users').findOne({'_id':req.params.user_id},
            {'image':true,'_id':false},function(err, result) {

                if(err) return res.status(500).send({"message":err});

                res.sendFile(__dirname+'/data/img/'+result.image);
        });
    });
});


apiRoutes.put('/user/img/:user_id',upload.single('file'), function(req, res) {

    var array = req.file.originalname.split('.');
    var ext = '.' + array[array.length-1];
    var name = req.params.user_id + ext;

    var file = __dirname + '/data/img/' + name;
      fs.rename(req.file.path, file, function(err) {
        if (err) {
          console.log(err);
          res.status(500).send({'message':err});
        } else {

            console.log(JSON.stringify({
                message : 'File uploaded successfully',
                filename : name
            }).green);

            res.json({
                message: 'File uploaded successfully',
                filename: name
            });
        }
      });
});

apiRoutes.put('/user',function(req, res) {

    //controllo se il client mi ha passato email e password
    if(req.body.email && req.body.password){

        //imposto l'utente
        var user = {
            '_id' : req.body.email,
            'password' : sha256(req.body.password),
            'balance' : 0
        };

        //inserisco l'utente nella collection utenti
        db.collection('users').insertOne(user,function(err, result) {

            if(err) return handleError({'message':"Errore, l'email selezionata è già stata scelta."},406,res);

            res.send({'message':'Inserimento completato con successo'});
        });
    }

    else return handleError({'message':'Errore, utente non trovato!'},406,res);
});


apiRoutes.post('/user',function(req,res){

    if(req.body.email && req.body.password){

        MongoClient.connect(config.database, function(err, db) {

            if(err){

                console.log(JSON.stringify(err.message).red);
                return res.status(503).send(err);
            }

            var cond = {
                '_id' : req.body.email,
                'password' : sha256(req.body.password)
            };

            console.log('found = ' + JSON.stringify(cond).green);

            db.collection('users').findOne(cond, function(err, result) {

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                if(result){

                    console.log(JSON.stringify(result).green);
                    res.send(result);
                }else{

                    var error = {'name':'User not found','message':'Error, user not found in database'};
                    console.log(JSON.stringify(error).red);

                    res.status(404).send(error);
                }

                db.close();
            });
        });
    }else {
        var err = {'name':'User not found','message':'Error, user not found in headers'};

        console.log(JSON.stringify(err.message).red);
        return res.status(406).send(err);
    }
});

apiRoutes.post('/user/:email',function(req, res) {

    //TODO controllare se esiste un body
    //TODO controllare se esiste l'email
    //TODO eseguire l'update della riga nel db

    var body = req.body;

    MongoClient.connect(config.database, function(err, db) {

        if(err){

            console.log(JSON.stringify(err.message).red);
            return res.status(503).send(err);
        }

        var element = {};

        if(body.name) element.name = body.name;

        if(body.location) element.location = body.location;

        if(body.gender) element.gender = body.gender;

        if(body.birthDate) element.birthDate = body.birthDate;

        if(body.categories) element.categories = body.categories;

        if(body.image) element.image = body.image;

        var cond = {'_id':req.params.email};

        console.log(element);
        console.log(cond);

        db.collection('users').updateOne(cond,
            {
                '$set': element
            },
            function(err,result){

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                result = {
                    'name':'ok',
                    'message':result
                };

                console.log(JSON.stringify(result).green);
                res.send(result);

                db.close();
            });
    });
});

apiRoutes.post('/user/changepassword/:email', function(req, res) {

    var body = req.body,
        newPass = sha256(body.newPassword),
        oldPass = sha256(body.oldPassword),
        cond,update;

    if(!newPass || !oldPass && (newPass === oldPass))
        return handleError({'message':'Password coincidenti'},403,res);

    cond = {'_id':req.params.email,'password': oldPass};
    db.collection('users').findOne(cond, function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) return handleError({'message':'Utente non trovato'},500,res);

        update = {'$set': {'password': newPass}};
        db.collection('users').updateOne(cond,update,function(err,result){

            if(err) return handleError(err,500,res);

            res.send({'message':'Password cambiata con successo'});
        });
    });
});


//RECORD------------------------------------------------------------------------

apiRoutes.get('/records/:email', function(req,res) {

    var cond;

    cond = {'user':req.params.email};
    db.collection('records').find(cond).toArray(function(err,result) {

        if(err) return handleError(err,500,res);

        var recordsLeft = result.length;
        var onComplete = function() { res.send(result); };

        if(recordsLeft === 0)
            return handleError({'message':'Errore, record non trovati'},404,res);

        result.forEach(function(record) {

            if(record.type === "Acquisto biglietto") {

                cond = {'_id':mongo.ObjectID(record.event)};
                db.collection('events').findOne(cond,function(err,result) {

                    if(err) return handleError(err,500,res);

                    record.event = result.title;

                    if(--recordsLeft === 0) {

                        onComplete();
                    }
                });
            } else {

                if(--recordsLeft === 0) {

                    onComplete();
                }
            }
        });
    });
});

apiRoutes.get('/tickets/:email', function(req, res) {

    var cond;

    //cerco tutti i record che indicano l'acquisto di un biglietto
    cond = {'user':req.params.email,'type':'Acquisto biglietto'};
    db.collection('records').find(cond).toArray(function(err,result) {

        if(err) return handleError(err, 500, res);

        var ticketsLeft = result.length;
        var onComplete = function() { res.send(result); };

        if(ticketsLeft === 0)
            return handleError({'message':'Errore, record non trovati'},404,res);

        result.forEach(function(ticket) {

            console.log(ticket.event);
            cond = {'_id':mongo.ObjectID(ticket.event)};
            db.collection('events').findOne(cond,function(err,result) {

                if(err) return handleError(err,500,res);

                if(result) ticket.event = result.title;

                if(--ticketsLeft === 0) {

                    onComplete();
                }
            });
        });
    });
});


apiRoutes.put('/records/:email', function(req,res) {

    var condition = {},
        update = {};
    //creo il nuovo record da inserire nel database
    //controllando se è un acquisto, in questo caso ha anche l'id dell'evento
    var date = new Date().getTime();
    var record = {
        'date' : date,
        'amount' : req.body.amount,
        'type' : req.body.type,
        'user' : req.params.email
    };
    if(req.body.event) record.event = req.body.event;

    //cerco lo stesso record all'interno della collection record
    condition = {'amount' : req.body.amount,'type' : req.body.type,'user' : req.params.email};
    db.collection('records').findOne(condition,function(err, result) {

        if(err) return handleError(err,500,res);

        //se il record cercato è un acquisto di un biglietto
        //e se la query indica che esiste già lo stesso risultato
        //ritorno un errore, notificando l'acquisto già avvenuto
        if(record.type === 'Acquisto biglietto' && result) {

            if(err) return handleError({'message':'Biglietto già acquistato!'},403,res);
        }

        //provo ad inserire il biglietto all'interno della collection records
        db.collection('records').insertOne(record,function(err, result) {

            if(err) return handleError(err,406,res);

            //eseguo l'update del campo balance dell'utente scelto
            condition = {'_id':record.user};
            update = {'$inc':{'balance':parseFloat(record.amount)}};
            db.collection('users').updateOne(condition,update,function(err,result) {

                if(err) return handleError(err,406,res);

                //se si tratta dell'acquisto di un biglietto
                //aggiungo l'email dell'utente tra i partecipanti dell'evento
                if(record.event && record.type === 'Acquisto biglietto') {

                    var response = {'record': record};

                    //aggiungo all'array delle partecipazioni, l'email dell'utente
                    condition ={'_id':new mongo.ObjectID(record.event)};
                    update = {'$push' : {'user_participations':record.user}};
                    db.collection('events').updateOne(condition,update,function(err, result) {

                        if(err) return handleError(err,406,res);

                        //eseguo un aggregate per restituirmi la lunghezza dell'array delle partecipazioni
                        condition = [{'$match' : condition},{'$project': {'participations': { $size: "$user_participations" }}}];
                        db.collection('events').aggregate(condition, function(err, result) {

                            response.message = 'Evvai!, adesso partecipi a questo evento!';
                            response.participations = result[0].participations;
                            res.send(response);
                        });
                    });

                } else {

                    console.log((result).green);
                    res.send(record);
                }
            });
        });
    });
});


//PLANNER-----------------------------------------------------------------------


apiRoutes.get('/planners/img/:planner_id',function(req, res) {

    var cond = {'_id':req.params.planner_id},
        proj = {'image':true,'_id':false};
    db.collection('planners').findOne(cond,proj,function(err, result) {

        if(err) return handleError(err,500,res);

        res.sendFile(__dirname+'/data/img/'+result.image);
    });
});

apiRoutes.get('/planners/:email', function(req,res) {

    var cond = {'_id':req.params.email};
    db.collection('planners').findOne(cond,function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) handleError({'message':'Utente non trovato'},404,res);

        res.send(result);
    });
});

apiRoutes.get('/planners/event/:planner_email', function(req, res) {

    var cond,project;

    //cerco la lista di id degli eventi di un planner
    cond = {'_id':req.params.planner_email};
    project = {'events':true,'_id':false};

    db.collection('planners').findOne(cond,project,function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) return handleError({'message':'Non è possibile completare la richiesta'},403,res);

        //cerco tutti gli eventi di quel planner
        cond = {'_id': { '$in' : result.events}};
        db.collection('events').find(cond).toArray(function(err,result) {

            if(err) return handleError(err,500,res);

            if(result.length === 0) return handleError({'message':'Eventi non trovati'},404,res);

            res.send(result);
        });
    });
});


apiRoutes.put('/planners/register', function(req,res) {

    if(!req.body.email || !req.body.password)
        return handleError({'message':'Inserire email e password'},403,res);

    var planner = {
        '_id' : req.body.email,
        'password' : sha256(req.body.password),
        'events' : [],
        'balance' : 0
    };
    db.collection('planners').insertOne(planner,function(err, result) {

        if(err) return handleError(err,403,res);

        res.send({'message':'Inserimento completato con successo'});
    });
});

apiRoutes.put('/planners/img/:planner_id',upload.single('file'),function(req, res) {

    var array = req.file.originalname.split('.');
    var name = req.params.planner_id + '.' + array[array.length-1];

    var file = __dirname + '/data/img/' + name;
    fs.rename(req.file.path, file, function(err) {

        if(err) return handleError(err,500,res);

        res.send({filename: name});
    });
});


apiRoutes.post('/planners/authenticate',function(req,res) {

    var cond;
    if(!req.body.email || !req.body.password)
        return handleError({'message':'Inserire email e password'},403,res);

    cond = {'_id' : req.body.email,'password' : sha256(req.body.password)};
    db.collection('planners').findOne(cond, function(err, result) {

        if(err) return handleError(err,500,res);

        if(!result) return handleError({'message':'Utente non trovato'},404,res);

        res.send(result);
    });
});

apiRoutes.post('/planners/:email', function(req,res) {

    var body = req.body;

    MongoClient.connect(config.database, function(err, db) {

        if(err){

            console.log(JSON.stringify(err.message).red);
            return res.status(503).send(err);
        }

        var element = {};

        if(body.name) element.name = body.name;

        if(body.location) element.location = body.location;

        if(body.gender) element.gender = body.gender;

        if(body.birthDate) element.birthDate = body.birthDate;

        if(body.categories) element.categories = body.categories;

        if(body.role) element.role = body.role;

        if(body.image) element.image = body.image;

        var cond = {'_id':req.params.email};

        console.log(element);
        console.log(cond);

        db.collection('planners').updateOne(cond,
            {
                '$set': element
            },
            function(err,result){

                if(err){
                    console.log(JSON.stringify(err.message).red);
                    return res.status(406).send(err);
                }

                result = {
                    'name':'ok',
                    'message':result
                };

                console.log(JSON.stringify(result).green);
                res.send(result);

                db.close();
            });
    });
});


apiRoutes.delete('/planners/:email', function(req,res) {

    var cond = {'_id':req.params.email};
    db.collection('planners').deleteOne(cond,function(err, result) {

        if(err) return handleError(err,500,res);

        res.send(result);
    });
});

//------------------------------------------------------------------------------

app.use('/api', apiRoutes);

function handleError(err,status,res) {

    console.log(JSON.stringify(err.message).red);
    return res.status(status).send(err);
}

app.listen(port, function () {
  	console.log('FourEvent.Backend in listening on ' + url);
});
