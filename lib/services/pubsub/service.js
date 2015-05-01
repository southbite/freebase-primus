var Primus = require('primus'),
    wildcard = require('wildcard'),
    utc = require('moment').utc(),
    async = require('async'),
    path = require('path'),
    shortid = require('shortid');

module.exports = {
    sessions:{},
    listeners:{},
    listeners_all:{},
    listeners_wildcard:{},
    trusted:{},
    initialize:function(config, done){
        var _this = this;

        if (config.timeout)
            config.timeout = false;

        _this.dataService = _this.freebase.services.data;
        _this.authService = _this.freebase.services.auth;

        _this.primus = new Primus(_this.freebase.server, {});

        _this.primus.on('connection', _this.onConnect.bind(_this));
        _this.primus.on('disconnection', _this.onDisconnect.bind(_this));

        var clientPath = path.resolve(__dirname, '../../public');
        
        _this.primus.save(clientPath + '/browser_primus.js');
    },
    handleDataResponse:function(e, message, response, eventSource){

        var _this = this;

        ////////////console.log(arguments);
        var responseData = {
            type:"response",
            status:'ok',
            payload:[], 
            published:false,
            eventId:message.eventId
        }

        if (e){
            responseData.status = 'error';
            responseData.payload = e.toString();
        }else{
            if (['set','remove'].indexOf(message.action) > -1){
                if (!message.parameters || !message.parameters.options || !message.parameters.options.noPublish){
                    var publication = {"payload":response, "message":message};
                    _this.publish(message, response);
                    responseData.published = true;
                }
                responseData.payload = response;
            }else if (message.action == "get"){
                if (Array.isArray(response)){
                    responseData.payload = response;
                }else{
                    responseData.payload = response.toArray();
                }
            }else
                responseData.payload = response;
        }

        return eventSource.write(responseData);
    },
    handle_message:function(message, socketInstance){
        var _this = this; 

        ////////console.log("handle_message");
        ////////console.log(message);

        if (!message.eventId) return socketInstance.write({status:'error', message:'All messages must have an eventId', type:'notification'});

        if (!message.token && message["action"] != 'login') return _this.handleDataResponse('Unauthenticated request, no session token', message, response, socketInstance);
           
        if (!message.parameters) message.parameters = {};

        try{


            if (message.action == 'login'){
                var sessionToken = _this.authService.login(message.data);
                   
                _this.sessions[sessionToken] = socketInstance;//setting to the socket
                return _this.handleDataResponse(null, message, sessionToken, socketInstance);

            }else{
                var decoded = _this.freebase.services.auth.decodeToken(message.token);

                //////console.log('message');
                //////console.log(message);

                switch (message.action) {
                    case 'on':
                        //////console.log('doing on');
                        //////console.log(message);
                        _this.addListener(message.path, message.token);  
                        _this.handleDataResponse(null, message, {status:'ok'}, socketInstance);
                        break;
                    case 'off': 
                        _this.removeListener(message.path, message.token);
                        _this.handleDataResponse(null, message, {status:'ok'}, socketInstance);
                        break;
                    case 'remove':
                         _this.dataService.remove(message.path, message.parameters, function(e, response){
                            _this.handleDataResponse(e, message, response, socketInstance);
                        });
                        break;
                    case 'set':
                        if (message.parameters.noStore) return _this.handleDataResponse(null, message, _this.dataService.transformSetData(message.path, message.data), socketInstance);
                        
                        _this.dataService.upsert(message.path, message.data, message.parameters, function(e, response){
                            _this.handleDataResponse(e, message, response, socketInstance);
                        });
                        break;
                    case 'get':
                        _this.dataService.get(message.path, message.parameters, function(e, response){
                            _this.handleDataResponse(e, message, response, socketInstance);
                        });
                        break;
                    default:
                        return _this.handleDataResponse('Unknown request action: ' + message["action"], message, null, socketInstance);
                }
            }

        }catch(e){
            return _this.handleDataResponse(e, message, null, socketInstance);
        }

        
    },
    onConnect:function(socket){
        var _this = this; 

        socket.on('data', function(message){
            _this.handle_message(message, socket);
        });
    },
    onDisconnect:function(socket){
       this.disconnect(socket.id);
    },
    getListenerDict:function(path){
        var _this = this;

        var listener_dict = _this.listeners;

        ////console.log('getting listenerDict');
        ////console.log(path);

        if (path == '/ALL@all')
            listener_dict = _this.listeners_all;

        if (path.indexOf('*') > -1)
            listener_dict = _this.listeners_wildcard;

        return listener_dict;
    },
    addListener:function(path, sessionToken){
        var _this = this;
        
        ////console.log('adding listenerDict');
        ////console.log(arguments);

        var decoded = _this.freebase.services.auth.decodeToken(sessionToken);
        var listener_dict = _this.getListenerDict(path);

        if (!listener_dict[path])
            listener_dict[path] = {};

        listener_dict[path][sessionToken] = 1;

    },
    removeListener:function(path, sessionToken){
        var _this = this;

        var listener_dict = _this.getListenerDict(path);

        var audience = listener_dict[path];
        delete audience[sessionToken];

        //_this.sessions[sessionToken].write({"type":"listener-removed", "path":path});
    },
    message:function(type, socket, data){
        socket.write({type:"message", "messageType":type, "data":data});
    },
    connect:function(handler){
        var _this = this;
        var sessionToken = _this.authService.generateToken();
        var emitter = {
            id:sessionToken,
            write:function(message){
                handler(message);
            }
        }
        _this.sessions[sessionToken] = emitter;
        return sessionToken;
    },
    disconnect:function(sessionToken){
        var _this = this;
        for (var path in _this.listeners){
            _this.removeListener(path, sessionToken);
        } 
    },
    emitToAudience:function(audience, publication, channel){
        var _this = this;
        if (audience){
            publication.channel = channel;
            Object.keys(audience).map(function(socketId){
                ////console.log('emitting');
                ////console.log(publication);
                _this.sessions[socketId].write(publication);
            });
        }
    },
    publish:function(message, payload){
        var _this = this;
       
        var channel = "/" + message.action.toUpperCase() + '@' + message.path;
        delete message.token;
        var publication = {"payload":payload, "timestamp":utc.valueOf(), "message":message, "type":"data"};

        ////console.log('channel');
        ////console.log(channel);
        ////console.log(_this.listeners);
        ////console.log(_this.listeners_all);

        _this.emitToAudience(_this.listeners[channel], publication, channel);
        _this.emitToAudience(_this.listeners_all['/ALL@all'], publication, '/ALL@all');

        for (var listenerPath in _this.listeners_wildcard){
            if (wildcard(channel, listenerPath)){
                _this.emitToAudience(_this.listeners_wildcard[listenerPath], publication, listenerPath);
            }
        }
    }
}