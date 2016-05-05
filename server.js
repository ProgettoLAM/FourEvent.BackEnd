var Hapi = require('hapi');
var server = new Hapi.Server();

//json array 
var users =
[
  {
    name : 'Gianmarco Spinaci',
    email : 'spino9330@gmail.com'
  },
  {
    name : 'Valentina Tosto',
    email : '94tinat@gmail.com'
  }
]

var quotes =
[
  {
    author: 'Audrey Hepburn',
    text: 'Nothing is impossible, the word itself says \'I\'m possible\'!'
  },
  {
    author: 'Walt Disney',
    text: 'You may not realize it when it happens, but a kick in the teeth may be the best thing in the world for you'
  }
, {
    author: 'Unknown'
  , text: 'Even the greatest was once a beginner. Don\'t be afraid to take that first step.'
  }
, {
    author: 'Neale Donald Walsch'
  , text: 'You are afraid to die, and you\'re afraid to live. What a way to exist.'
  }
];



server.connection({
    host: 'localhost',
    port: Number(process.argv[2] || 8080)
});

server.route({
    method: 'GET',
    path: '/user',
    handler: function (request, reply) {
        reply(users);
    }
});

server.route({
    method: 'GET',
    path: '/user/{email}',
    handler: function (request, reply) {


        reply(users.find({'username':req.params.email}));
    }
});

server.route({
    method: 'GET',
    path:'/',
    handler: function (request, reply) {

        return reply('Hello HAPI');
    }
});

server.route({
    method: 'GET',
    path: '/quote',
    handler: function (request, reply) {
        reply(quotes);
    }
});

server.route({
  method: 'GET'
, path: '/quote/{id}'
, handler: function(req, reply) {

    if (quotes.length <= req.params.id) {
        return reply('No quote found.').code(404);
      }
      return reply(quotes[req.params.id]);
  }
});

server.route({
    method: 'GET',
    path: '/name/{name}',
    handler: function (request, reply) {
        reply('Hello, ' + encodeURIComponent(request.params.name) + '!');
    }
});

server.start(function () {
    console.log('Server running at:', server.info.uri);
});
