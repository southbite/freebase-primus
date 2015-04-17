var expect = require('expect.js');
var freebase = require('../lib/index');
var service = freebase.service;
var freebase_client = freebase.client;
var faye = require('faye');
var async = require('async');

describe('e2e test', function () {

  var testport = 8000;
  var test_secret = 'test_secret';
  var mode = "embedded";
  var default_timeout = 100000;
  var freebaseInstance = null;

  /*
   This test demonstrates starting up the freebase service -
   the authentication service will use authTokenSecret to encrypt web tokens identifying
   the logon session. The utils setting will set the system to log non priority information
   */

  it('should initialize the service', function (callback) {

    this.timeout(default_timeout);

    try {
      service.initialize({
          mode: 'embedded',
          services: {
            auth: {
              path: './services/auth/service.js',
              config: {
                authTokenSecret: 'a256a2fd43bf441483c5177fc85fd9d3',
                systemSecret: test_secret
              }
            },
            data: {
              path: './services/data_embedded/service.js',
              config: {}
            },
            pubsub: {
              path: './services/pubsub/service.js',
              config: {}
            }
          },
          utils: {
            log_level: 'info|error|warning',
            log_component: 'prepare'
          }
        },
        function (e, freebase) {
          if (e)
            return callback(e);

          freebaseInstance = freebase;
          callback();
        });
    } catch (e) {
      callback(e);
    }
  });

  var publisherclient;
  var listenerclient;

  /*
   We are initializing 2 clients to test saving data against the database, one client will push data into the
   database whilst another listens for changes.
   */
  it('should initialize the clients', function (callback) {

    this.timeout(default_timeout);

    try {
      //plugin, config, context,
      freebase_client.load({
        plugin: freebase.client_plugins.intra_process,
        context: freebaseInstance
      }, function (e, client) {

        publisherclient = client;

        if (e)
          return callback(e);

        freebase_client.load({
          plugin: freebase.client_plugins.intra_process,
          context: freebaseInstance
        }, function (e, client) {

          if (e)
            return callback(e);

          listenerclient = client;
          callback(e);


        });

      });

    } catch (e) {
      callback(e);
    }

  });

  it('should fail to subscribe to an event', function (callback) {

    this.timeout(default_timeout);
    subWasSuccessful = true;

    freebase_client.load({config: {host: 'localhost', port: testport, secret: test_secret}}, function (e, badclient) {

      badclient.onMessage('badclient_test', 'error', function (message) {

        console.log('on message called yay');

        if (message.data.status == 'Authentication failed')
          subWasSuccessful = false;

      }, function (e) {

        badclient.token = 'rubbish';
        badclient.onAll(function (e, message) {

          ////console.log('on all happened');

        }, function (e) {

          if (e)
            callback(e);
          else {
            setTimeout(function () {

              if (subWasSuccessful)
                callback('unauthorized subscribe was let through');
              else
                callback();

            }, 2000);
          }

        });

      });

    });

  });

  it('should handle sequences of events by writing as soon as possible, and ensure the events push the correct data values back', function (callback) {

    this.timeout(default_timeout);

    freebase_client.load({
      plugin: freebase.client_plugins.intra_process,
      context: freebaseInstance
    }, function (e, client) {

      if (e)
        return callback(e);

      var stressTestClient = client;

      setTimeout(function () {

        var count = 0;
        var expected = 1000;
        var receivedCount = 0;

        var received = {};
        var sent = [expected];

        for (var i = 0; i < expected; i++) {
          sent[i] = require('shortid').generate();
        }

        //////console.log('about to go');
        //////console.log(sent);

        //first listen for the change
        stressTestClient.on('/e2e_test1/testsubscribe/sequence', 'PUT', 0, function (e, message) {

          //////console.log('Event happened', message);

          if (e)
            return callback(e);

          receivedCount++;

          if (received[message.data.property1])
            received[message.data.property1] = received[message.data.property1] + 1;
          else
            received[message.data.property1] = 1;

          //////console.log('RCOUNT');


          //console.log(receivedCount);
          //console.log(sent.length);

          if (receivedCount == sent.length) {
            console.timeEnd('timeTest1');
            expect(Object.keys(received).length == expected).to.be(true);
            //////console.log(received);

            callback();
          }

        }, function (e) {

          //////console.log('ON HAS HAPPENED: ' + e);

          if (!e) {

            expect(stressTestClient.events['/PUT@/e2e_test1/testsubscribe/sequence'].length).to.be(1);
            console.time('timeTest1');

            while (count < expected) {

              //////console.log(count);
              //////console.log(expected);
              //////console.log(sent[count]);

              publisherclient.set('/e2e_test1/testsubscribe/sequence', {
                property1: sent[count]
              }, {excludeId: true}, function (e, result) {

                //////console.log(e);
                //////console.log(result);

                if (e)
                  return callback(e);


              });

              count++;
            }

          }
          else
            callback(e);
        });

      }, 2000)


    });
  });

  it('should handle sequences of events by writing as soon as possible', function (callback) {

    this.timeout(default_timeout);

    freebase_client.load({
      plugin: freebase.client_plugins.intra_process,
      context: freebaseInstance
    }, function (e, client) {

      if (e)
        return callback(e);

      var stressTestClient = client;

      setTimeout(function () {

        var count = 0;
        var expected = 1000;
        var receivedCount = 0;
        var timerName = expected + 'Events - no wait';

        var received = {};
        var sent = [expected];

        for (var i = 0; i < expected; i++) {
          sent[i] = require('shortid').generate();
        }

        //////console.log('about to go');
        //////console.log(sent);

        //first listen for the change
        stressTestClient.on('/e2e_test1/testsubscribe/sequence1', 'PUT', 0, function (e, message) {

          //////console.log('Event happened', message);

          if (e)
            return callback(e);

          receivedCount++;

          /*
           if (received[message.data.property1])
           received[message.data.property1] = received[message.data.property1] + 1;
           else
           received[message.data.property1] = 1;
           */
          //////console.log('RCOUNT');


          //console.log(receivedCount);
          //console.log(sent.length);

          if (receivedCount == expected) {
            console.timeEnd(timerName);
            //expect(Object.keys(received).length == expected).to.be(true);
            //////console.log(received);

            callback();
          }

        }, function (e) {

          //////console.log('ON HAS HAPPENED: ' + e);

          if (!e) {

            //expect(stressTestClient.events['/PUT@/e2e_test1/testsubscribe/sequence'].length).to.be(1);
            console.time(timerName);

            function writeData() {

              if (count == expected) {
                return;
              }
              ;

              ////////console.log('putting data: ', count);
              publisherclient.set('/e2e_test1/testsubscribe/sequence1', {
                property1: sent[count++]
              }, {excludeId: true}, function (e, result) {
                writeData();
              });
            }

            writeData();

          }
          else
            callback(e);
        });

      }, 2000)


    });
  });

  it('should handle sequences of events by writing as soon as possible, without storing', function (callback) {

    this.timeout(default_timeout);

    freebase_client.load({
      plugin: freebase.client_plugins.intra_process,
      context: freebaseInstance
    }, function (e, client) {

      if (e)
        return callback(e);

      var stressTestClient = client;

      setTimeout(function () {

        var count = 0;
        var expected = 1000;
        var receivedCount = 0;
        var timerName = expected + 'Events - no wait - no store';

        //first listen for the change
        stressTestClient.on('/e2e_test1/testsubscribe/sequence1', 'PUT', 0, function (e, message) {

          //////console.log('Event happened', message);

          if (e)
            return callback(e);

          receivedCount++;

          /*
           if (received[message.data.property1])
           received[message.data.property1] = received[message.data.property1] + 1;
           else
           received[message.data.property1] = 1;
           */
          //////console.log('RCOUNT');


          //console.log(receivedCount);
          //console.log(sent.length);

          if (receivedCount == expected) {
            console.timeEnd(timerName);
            //expect(Object.keys(received).length == expected).to.be(true);
            //////console.log(received);

            callback();
          }

        }, function (e) {

          //////console.log('ON HAS HAPPENED: ' + e);

          if (!e) {

            //expect(stressTestClient.events['/PUT@/e2e_test1/testsubscribe/sequence'].length).to.be(1);
            console.time(timerName);

            function writeData() {

              if (count == expected) {
                return;
              }

              ////////console.log('putting data: ', count);
              publisherclient.set('/e2e_test1/testsubscribe/sequence1', {
                property1: count++
              }, {noStore: true}, function (e, result) {
                writeData();
              });
            }

            writeData();

          }
          else
            callback(e);
        });

      }, 2000)


    });

  });

  it('should handle sequences of events by when the previous one is done', function (callback) {

    this.timeout(default_timeout);

    var count = 0;
    var expected = 1000;
    var receivedCount = 0;
    var timerName = expected + 'Events';

    //first listen for the change
    listenerclient.on('/e2e_test1/testsubscribe/sequence3', 'PUT', 0, function (e, message) {

      //console.log('Event happened', message);
      receivedCount++;

      if (receivedCount == expected) {
        console.timeEnd(timerName);
        callback();
      }

    }, function (e) {

      //////////////console.log('ON HAS HAPPENED: ' + e);

      if (!e) {

        //////////////console.log('on subscribed, about to publish');
        //then make the change
        console.time(timerName);
        writeData();
      }
      else
        callback(e);
    });

    function writeData() {

      if (count == expected) {
        return;
      }
      ;

      ////////console.log('putting data: ', count);
      publisherclient.set('/e2e_test1/testsubscribe/sequence3', {
        property1: count++
      }, {excludeId: true}, function (e, result) {
        writeData();
      });
    }

  });


  it('should handle sequences of events by when the previous one is done, without storing', function (callback) {

    this.timeout(default_timeout);

    var count = 0;
    var expected = 1000;
    var receivedCount = 0;
    var timerName = expected + 'Events - no store';

    //first listen for the change
    listenerclient.on('/e2e_test1/testsubscribe/sequence3', 'PUT', 0, function (e, message) {

      //console.log('Event happened', message);
      receivedCount++;

      if (receivedCount == expected) {
        console.timeEnd(timerName);
        callback();
      }

    }, function (e) {

      //////////////console.log('ON HAS HAPPENED: ' + e);

      if (!e) {

        //////////////console.log('on subscribed, about to publish');
        //then make the change
        console.time(timerName);
        writeData();
      }
      else
        callback(e);
    });

    function writeData() {

      if (count == expected) {
        return;
      }

      ////////console.log('putting data: ', count);
      publisherclient.set('/e2e_test1/testsubscribe/sequence3', {
        property1: count++
      }, {noStore: true}, function (e, result) {
        writeData();
      });
    }

  });


});