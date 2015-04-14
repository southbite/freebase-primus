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
       
        //console.log(message);
        //console.log(_this.listeners);

        var publishToAudience = function(path, audience){
            if (audience){
                message.path = path;

                Object.keys(audience).map(function(socketId){
                    _this.connections[socketId].write(message);
                });
            }
        }

        publishToAudience(event.path, _this.listeners[event.path]);
        publishToAudience('/ALL@all', _this.listeners['/ALL@all']);

        for (var listenerPath in _this.listeners){
            if (listenerPath.indexOf('*') > -1 && wildcard(event.path, listenerPath)){
                publishToAudience(_this.listeners[listenerPath]);
            }
        }
    }
}