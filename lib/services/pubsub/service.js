var Primus = require('primus'),
    wildcard = require('wildcard'),
    utc = require('moment').utc(),
    async = require('async'),
    path = require('path');

module.exports = {
    connections:{},
    listeners:{},
    listeners_all:{},
    listeners_wildcard:{},
    initialize:function(config, done){
        var _this = this;

        if (config.timeout)
            config.timeout = false;

        _this.primus = new Primus(_this.freebase.server, {});

        _this.primus.on('connection', _this.onConnect.bind(_this));
        _this.primus.on('disconnection', _this.onDisconnect.bind(_this));

        var clientPath = path.resolve(__dirname, '../../public');
        
        _this.primus.save(clientPath + '/primus-client.js');
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
    getListenerDict:function(path){
        var _this = this;

        var listener_dict = _this.listeners;

        if (path == '/ALL@all')
            listener_dict = _this.listeners_all;

         if (path.indexOf('*') > -1)
            listener_dict = _this.listeners_wildcard;

        return listener_dict;
    },
    addListener:function(path, connectionId){
        var _this = this;
        
        var listener_dict = _this.getListenerDict(path);

        if (!listener_dict[path])
            listener_dict[path] = {};

        listener_dict[path][connectionId] = 1;
    },
    removeListener:function(path, connectionId){
        var _this = this;

        var listener_dict = _this.getListenerDict(path);

        var audience = listener_dict[path];
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
    emitToAudience:function(path, audience, message){
        var _this = this;
        if (audience){
           
            message.path = path;
            Object.keys(audience).map(function(socketId){
                _this.connections[socketId].write(message);
            });
        }
    },
    publish:function(event){
        var _this = this;

        var message = {"type":"data", "payload":event.payload, "timestamp":utc.valueOf(), "action":event.action};

        _this.emitToAudience(event.path, _this.listeners[event.path], message);
        _this.emitToAudience('/ALL@all', _this.listeners_all['/ALL@all'], message);

        for (var listenerPath in _this.listeners_wildcard){
            if (wildcard(event.path, listenerPath)){
                _this.emitToAudience(_this.listeners_wildcard[listenerPath], message);
            }
        }
    }
}