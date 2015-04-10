var Primus = require('primus'),
    wildcard = require('wildcard'),
    utc = require('moment').utc();

module.exports = {
    connections:{},
    listeners:{},
    initialize:function(config, done){
        var _this = this;

        if (config.timeout)
            config.timeout = false;

        _this.primus = new Primus(_this.freebase.server, {});

        _this.primus.on('connection', _this.onConnect.bind(_this));
        _this.primus.on('disconnection', _this.onDisconnect.bind(_this));
    },
    onConnect:function(socket){
        var _this = this; 

        socket.on('data', function(data){

            _this.freebase.services.auth.decodeToken(data, function(e, decoded){

                if (e)
                    return _this.message("error", this, {status:'Authentication failed', message:e.toString(), data:data});

                if (data["action"] == 'on'){
                    _this.addListener(data.path, this.id);  
                }else if (data["action"] == 'off'){
                    _this.removeListener(data.path, this.id);
                }
            }.bind(socket));

        });

        _this.connections[socket.id] = socket;
    },
    onDisconnect:function(socket){
       this.disconnect(socket.id);
    },
    addListener:function(path, connectionId){
        var _this = this;

        if (!_this.listeners[path])
            _this.listeners[path] = {};

        _this.listeners[path][connectionId] = 1;
    },
    removeListener:function(path, connectionId){
        var _this = this;

        var audience = _this.listeners[path];
        delete audience[connectionId];

        _this.connections[connectionId].write({"type":"listener-removed", "path":path});
    },
    message:function(type, socket, data){
        socket.write({type:"message", "messageType":type, "data":data});
    },
    connect:function(handler){
        var _this = this;
        var connectionId = require('shortid').generate() + require('shortid').generate();
     
        var emitter = {
            id:connectionId,
            write:function(message){
                handler(message);
            }
        }

        _this.connections[connectionId] = emitter;
        return connectionId;
    },
    disconnect:function(connectionId){
        var _this = this;
        for (var path in Object.keys(_this.listeners)){
            _this.removeListener(path, connectionId);
        } 
    },
    publish:function(event){
        var _this = this;

        var message = {"type":"data", "payload":event.payload, "timestamp":utc.valueOf(), "action":event.action};
       
        for (var listenerPath in _this.listeners){

            if (listenerPath == '/ALL@all' || wildcard(event.path, listenerPath)){

                message.path = listenerPath;
                var audience = _this.listeners[listenerPath];

                Object.keys(audience).map(function(socketId){
                    //////console.log('WRITING');
                    //////console.log([socketId, message]);
                    _this.connections[socketId].write(message);
                });
            }
        }
    }
}