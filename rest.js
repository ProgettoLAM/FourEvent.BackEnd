'use strict';

const Hapi = require('hapi');
var fs = require('fs');

const server = new Hapi.Server();
server.connection({ port: 3000 });

server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
        console.log("requested : /");
        reply('Hello, world!');
    }
});

server.route({
    method: 'GET',
    path: '/users',
    handler: function (request, reply) {

      fs.readFile('users.json', 'utf8', function (err, data) {
        if (err) throw err;
        console.log("requested : /users");
        reply(JSON.parse(data));

      });
    }
});

server.start((err) => {

    if (err) {
        throw err;
    }
    console.log('Server running at:', server.info.uri);
});
