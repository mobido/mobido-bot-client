//
// Local API for development ONLY.
// In production, the BotWidgetHost variable will already be set, so
// this file won't create it's own shim.
//
// FOR DEVELOPERS: This shim won't be ready immediately, and needs to load data.
// The isReady() becomes true when the shim can start accepting calls.
//

if( window.BotWidgetHost === undefined ) BotWidgetHost = (function () {
    var my = { mock: true };

    var callbackObjectName;
    var shimData;
    var botname = getBotname();
    var optionItemsUL;
    var ajaxReady = false;

    // load local card testing 
    $.getJSON('/dev/shim-data.json',function(data){
        console.log('Loaded shim data',data);
        shimData = data;

        //optionItemsUL = $("<ul id='moreOptions'>");
        //optionItemsUL.appendTo(document.body);
        /*var mycid = data.users[0].card.cid;
        $('<div>').text('mycid: ' + mycid ).appendTo(document.body);
        var tid = data.thread.tid;
        $('<div>').text('tid: ' + tid ).appendTo(document.body);
        $('<div>').text('mqhook: mqhook/tid/' + tid + '/cid/' + mycid + '/pace' ).appendTo(document.body);

        var a = $('<a href="#"/>').text("onViewWillAppear").click(function(){
            var js = callbackObjectName + '.onViewWillAppear()';
            eval( js );
        });
        $('<div>').append( a ).appendTo( document.body );
        */

        secureAjax();
    });

    function isReady() {
        if( typeof forge === 'undefined' )
            return false;

        return ajaxReady; 
    }
    
    //===== Config =====
                
    // set the object name used for callbacks from the Application
    my.setCallbackObjectName = function(objectName) {
        callbackObjectName = objectName;
        console.log( "Callback object name set to", objectName );
    }
    my.setCallbackObjectName("BotWidgetCallbacks"); // default value
    
    // set desired height of bot widget
    my.setHeight = function(height) {
        console.log( "Widget height set to", height );
    }

    my.fetchEnvironment = function() {
        var env = { version:'1.4.6', debug: true, tz:'America/Los_Angeles' };
        var js = callbackObjectName + '.onEnvironment(' + JSON.stringify(env) + ')';
        eval( js );
    }

    // options = { items: [ { id:, label:, url: } ] }
    my.setOptionItems = function(options) {
        if( !optionItemsUL ) {
            optionItemsUL = $("<ul id='moreOptions'>");
            optionItemsUL.appendTo(document.body);
        } 
        optionItemsUL.empty();

        if( !options.items )
            return; // nothing to show

        options.items.forEach(function(item){
            var a = $('<a href="#"/>').text(item.label).click(function(){
                handleOptionItemSelected(item);
            });
            var li = $('<li>').append(a);
            optionItemsUL.append( li );
        });
    }

    my.setupScreen = function(options) {
        console.log( "Setup screen with", options);
    }

    // options = null means remove the back button
    my.setBackButton = function(options) {
        console.log( "Set back button", options);
    }

    function handleOptionItemSelected(item) {
        if( item.url ) {
            window.location.href = item.url;
        } else if( item.id ) {
            var js = callbackObjectName + '.onOptionItemSelected(' + JSON.stringify(item.id) + ')';
            eval( js );
        }
    }

    //===== Cross widget communication =====

    my.signal = function(name,value) {
        console.log( 'Signal sent:', name, JSON.stringify(value) );
    }

    //===== Navigation =====

    my.closeBotWidget = function() {
        window.history.back();
    }

    //===== Location =====

    // fetch users current location
    // Local function and never touches the network
    my.fetchLocation = function() {
        fetchGeoloc(function(err,geoloc){
            if( err )
                console.log( "Location problem", err );
            else 
                callbackLocation(geoloc);
        });
    }

    // send my current location to everyone in this thread (including this map bot's server)
    my.sendLocation = function() {
        fetchGeoloc(function(err,geoloc){
            if( err )
                console.log( "Location problem", err );
            else {
                // give local widget location directly
                callbackLocation(geoloc);

                // AND send it to the webhook (as if the Mobido servers did)
                var msg = craftMessageEnvelope();
                msg.meta = { com_mobido_geoloc: geoloc };
                webhook( msg );  

                // AND... simulate us seeing our own message looping back from the broadcast
                BotWidgetCallbacks.onIncomingMessage( msg );
            }
        });
    }

    // request location from all users in this chat thread for duration minutes
    // This also sends my location for duration minutes
    my.requestLocationUpdates = function(duration) {
        // if there's an existing timer, cancel it
        if( updateTimer )
            clearTimeout( updateTimer );

        console.log( 'Requested locations for', duration, 'minutes' );
        if( duration > 30 ) {
            console.log( 'Duration has been trimmed to 30 minute max' );
            duration = 30;  // at most 30
        }

        locationUpdates = { expires: Date.now() + duration * ONE_MINUTE_MILLIS };
        onLocationUpdate();     // fire off one right away
    }

    // stop sending my location updates.  This does not cancel updates from others.
    my.cancelLocationUpdates = function() {
        console.log( "Cancelled location updates" );
        locationUpdates = null;
    }

    //
    // Location utilitites
    //

    var ONE_MINUTE_MILLIS = 60 * 1000;
    var locationUpdates;
    var updateTimer;

    // next( err, {lat:, lng:} )
    function fetchGeoloc(next) {
        if( !navigator.geolocation )
            return next( new Error( "Location not supported" ) );

        console.log( "Fetching location" );
        navigator.geolocation.getCurrentPosition( function( position ) {
            var coords = position.coords;
            next( null, { lat:coords.latitude, lng:coords.longitude } );
        });
    }

    function callbackLocation(geoloc) {
        var js = callbackObjectName + '.onLocation(' + JSON.stringify(geoloc) + ')';
        eval( js );     
    }

    function onLocationUpdate() {
        if( !locationUpdates )
            return;
        if( locationUpdates.expires < Date.now() ) {
            console.log( "Location updates expired" );
            locationUpdates = null;
            return;
        }

        my.sendLocation();

        // schedule next one a minute from now
        updateTimer = setTimeout( onLocationUpdate, ONE_MINUTE_MILLIS ); 
    }

    //===== Calendar =====

    var SECONDS_IN_HOUR = 60 * 60;

    // fake out 60 days of freebusy, only good for this run of the program, resets on next page load
    var fakeScheduleCache = createFakeScheduleCache();
    function createFakeScheduleCache() {
        var currentDay = new Date();   // in my timezone :)
        currentDay.setHours(0,0,0,0);  // pull back to last midnight

        var cache = {};
        for( var i = 0; i < 10; i++ ) {
            var busy = [];
            var midnightSeconds = Math.floor(currentDay.getTime() / 1000);  // start of current day

            // between 1 and 5 events this day
            var count = Math.floor( Math.random() * 5 );
            var used = {};  // hours in day already used/marked as busy
            while( count-- > 0 ) {
                var hour;
                do {
                    hour = Math.floor( Math.random() * 9 + 8 );     // time from 8am to 5pm
                } while( used[hour] );  // hunt until we find free hour
                used[hour] = true;  // mark as used

                //console.log( 'Adding',hour,'on',currentDay.toDateString());

                var startSeconds = midnightSeconds + hour * SECONDS_IN_HOUR;
                busy.push( [ startSeconds, startSeconds + SECONDS_IN_HOUR ] );    
            }

            // ensure the busy times are in chronological order
            busy.sort(function(a,b){
                return a[0] - b[0];
            });

            cache[currentDay.toDateString()] = busy;
            currentDay.setDate( currentDay.getDate() + 1 );    // move to next day  
        }

        return cache;
    }

    function fakeSchedule(startDay,endDay) {
        var day = new Date();   // in my timezone :)
        day.setHours(0,0,0,0);  // pull back to last midnight
        day.setDate( day.getDate() + startDay );    // move to first day

        var schedule = { tz: 'America/Los_Angeles', busy:[], start:toSeconds(day) };

        // how many hours of days should we put events in?
        var totalDays = endDay - startDay + 1;  // end day is inclusive
        for( var i = 0; i < totalDays; i++ ) {
            var busy = fakeScheduleCache[day.toDateString()];
            if( busy ) busy.forEach(function(range) {
                schedule.busy.push(range);
            });

            day.setDate( day.getDate() + 1 );   // move to next day  
        }

        // mark end 
        schedule.end = toSeconds(day) - 60; // one minute before midnight, 11:59

        console.log( "Faked schedule is", JSON.stringify(schedule));

        return schedule;
    }

    function toSeconds(date) {
        var millis = date.getTime();
        return Math.floor(millis / 1000);
    }

    // fetches the current users free busy
    my.fetchFreeBusy = function(startDay, endDay) {
        if( !startDay )
            startDay = 0;
        if( !endDay )
            endDay = 14;

        setTimeout(function() {
            var schedule = fakeSchedule(startDay, endDay)
            console.log( "Fetching free/busy", schedule );
            var js = callbackObjectName + '.onFreeBusy(\'granted\',' + JSON.stringify(schedule) + ')';
            eval( js );
        }, 100 );
    }

    // requests the phone to keep the bot server updated with any changes
    // to the current users free/busy for the time period specified
    my.requestFreeBusyUpdates = function(startDay, endDay, webhook) {
        console.log( "Requested free/busy updates" );

        setTimeout(function() {
            var js = callbackObjectName + '.onFreeBusyRequest(\'granted\')';
            eval( js );
        }, 100 );  
    }

    my.cancelFreeBusyUpdates = function() {
        console.log( "Cancelled free/busy updates" );
    }
                
    //===== Thread/messages =====

    my.fetchThreadList = function(tids) {
        // are we done setting up?
        if( !isReady() ) {
            console.log( 'fetchThreadList() waiting 100ms' );
            setTimeout( function() {
                my.fetchThreadList(tids);
            }, 100 );
            return;
        }

        var list = [];
        if( tids && shimData.thread ) {
            tids.forEach(function(id){
                if( id == shimData.thread.tid )
                    list.push( shimData.thread );
            });
        }

        var result = { found:list };
        console.log( "Received thread list", result );
        var js = callbackObjectName + '.onThreadList(' + JSON.stringify(result) + ')';
        eval( js );
    }
    
    my.fetchThread = function() {
        // are we done setting up?
        if( !isReady() ) {
            console.log( 'fetchThread() waiting 100ms' );
            setTimeout( function() {
                my.fetchThread();
            }, 100 );
            return;
        }

        var thread = shimData.thread;
        console.log( "Received thread", thread );
        var js = callbackObjectName + '.onThread(' + JSON.stringify(thread) + ')';
        eval( js );
    }
    
    my.fetchMessageHistory = function() {
        // are we done setting up?
        if( !isReady() ) {
            console.log( 'fetchMessageHistory() waiting 100ms' );
            setTimeout( function() {
                my.fetchMessageHistory();
            }, 100 );
            return;
        }

        var sender = myCard();
        var history = [];
        for( var i = 0; i < 20; i++ ) {
            var now = new Date().toISOString();
            var msg = {from:myCard.cid, created:now, body:'message ' + i };
            history.push( msg );
        }

        console.log( "Received message history", history );
        var js = callbackObjectName + '.onMessageHistory(null,' + JSON.stringify(history) + ')';
        eval( js );
    }

    my.ensureExclusiveChat = function() {
        console.log( "ensureExclusiveChat()" );

        var thread = shimData.thread;
        var js = callbackObjectName + '.onExclusiveChat(null,' + JSON.stringify(thread) + ')';
        eval( js );
    }

    my.showChat = function(options) {
        console.log( "showChat()" );
        alert( 'showChat(' + JSON.stringify(options) + ')' );
    }
                
    //===== Cards =====

    function botCard() { return shimData.bots[botName()].card; }
    function myCard() { return shimData.users[0].card; }
    //function peerCard() { return shimData.peer.card; }
    function botName() {
        var path = window.location.pathname.split('/');
        var name = path[path.length-2];

        console.log( 'Bot name is', name );
        return name;
    }
    
    my.fetchThreadCards = function() {
        // are we done setting up?
        if( !isReady() ) {
            console.log( 'fetchThreadCards() waiting 100ms' );
            setTimeout( function() {
                my.fetchThreadCards();
            }, 100 );
            return;
        }

        console.log( "Requested thread cards" );

        // what cards are we looking for?
        var cids = shimData.thread.cids;

        // find the bot cards
        var cards = [];
        var botNames = Object.keys(shimData.bots);
        for( var i = 0; i < botNames.length; i++ ) {
            var card = shimData.bots[botNames[i]].card;
            if( cids.indexOf( card.cid ) > -1 ) {
                cards.push( card );
            }
        }

        // also add my user card
        var mycard = myCard();
        if( cids.indexOf( mycard.cid ) > -1 ) {
            cards.push( mycard );
        }

        console.log( "Received thread cards", cards );
        var js = callbackObjectName + '.onThreadCards(' + JSON.stringify(cards) + ')';
        eval( js );
    }
    
    my.fetchUserCard = function() {
        // are we done setting up?
        if( !isReady() ) {
            console.log( 'fetchUserCard() waiting 100ms' );
            setTimeout( function() {
                my.fetchUserCard();
            }, 100 );
            return;
        }

        console.log( "Requested user card" );

        var card = myCard();
        console.log( "Received user card", card );
        var js = callbackObjectName + '.onUserCard(' + JSON.stringify(card) + ')';
        console.log( 'UserCard callback:', js );
        eval( js );
    }
    
    my.fetchBotCard = function() {
        // are we done setting up?
        if( !isReady() ) {
            console.log( 'fetchBotCard() waiting 100ms' );
            setTimeout( function() {
                my.fetchBotCard();
            }, 100 );
            return;
        }

        var botname = botName();
        var card = shimData.bots[botname].card;

        console.log( "Received bot card", card );
        var js = callbackObjectName + '.onBotCard(' + JSON.stringify(card) + ')';
        eval( js );
    }

    my.selectUserCard = function(options) {
        var card = shimData.users[0].card;

        console.log( "selectUserCard(" + JSON.stringify(card) + ')' );
        var js = callbackObjectName + '.onUserCardSelected(null,' + JSON.stringify(card) + ')';
        eval( js );
    }
    
    //===== RPC =====
               
    my.queryBotServerJson = function(handle,path) {

        // are we done setting up?
        if( !isReady() ) {
            console.log( 'queryBotServerJson() waiting 100ms' );
            setTimeout( function() {
                my.queryBotServerJson(handle,path);
            }, 100 );
            return;
        }

        var msg = { handle:handle, path:path };
        console.log( "Query bot server JSON", msg );

        $.getJSON( path, function( data ) {
            doCallback('onBotServerJsonResponse',handle,data);
        }).fail(function( jqXHR, textStatus, errorThrown ){
            var failure = { code:jqXHR.status, message:jqXHR.statusText };
            doCallback('onBotServerErrorResponse',handle,failure);
        });
    }
  
    my.updateBotServerJson = function(handle,method,path,data) {
        var json = JSON.stringify(data);
        my.updateBotServer(handle,method,path,json,"application/json");
    }

    my.updateBotServer = function(handle,method,path,content,contentType) {
        // are we done setting up?
        if( !isReady() ) {
            console.log( 'updateBotServer() waiting 100ms' );
            setTimeout( function() {
                my.updateBotServer(handle,method,path,content,contentType);
            }, 100 );
            return;
        }

        var msg = { handle:handle, method:method, path:path, content:content, contentType:contentType };
        console.log( "updateBotServer()", msg );

        $.ajax({
            url:path,
            type:method,
            data:content,
            contentType:contentType,
            success: function(result) {
                doCallback('onBotServerJsonResponse',handle,result);
            }
        }).fail(function( jqXHR, textStatus, errorThrown ){
            var failure = { code:jqXHR.status, message:jqXHR.statusText };
            doCallback('onBotServerErrorResponse', handle, failure );
        });
    }

    //
    // Utility
    //

    function craftMessageEnvelope() {
        var primeUser = shimData.users[0];   // shims always have at least one user

        var msg = { from: primeUser.card.cid, tid: shimData.thread.tid, created: new Date().toISOString() };
        return msg;
    }

    function doCallback(functionName,handle,data) {
        var h = JSON.stringify(handle);
        var result = JSON.stringify(data);
        var js = callbackObjectName + '.' + functionName + '(' + h + ',' + result + ')';
        console.log( 'doCallback', js );
        if( handle )
            eval( js );    // only if handle is provided
    }

    function webhook(data) {
        if( !isReady() ) {
            console.log( 'webhook() waiting 100ms' );
            setTimeout( function() {
                webhook(data);
            }, 100 );
            return;
        }

        var content = JSON.stringify(data);
        console.log( "webhook()", content );

        $.ajax({
            url:"webhook",
            type:"POST",
            data:content,
            contentType: "application/json",
            success: function(result) {
                console.log( "Webhook success");
            }
        }).fail(function( jqXHR, textStatus, errorThrown ){
            console.log( "Webhook failure", errorThrown );
        });    
    }

    // url has pattern .../checklist/checklist.html
    function getBotname() {
        var tokens = document.URL.split(/[\/]/);
        var botname = tokens[tokens.length-2];
        //console.log( 'botname', botname, 'from', tokens ); 

        return botname;   
    }

    // Simulates a Mobido App running a widget communicating with the bot server
    function secureAjax() {

        console.log( 'Loading forge libraries for dev/testing');
        var jsfiles = ['forge','hmac','md','sha256','util'];
        var filesLoaded = 0;
        jsfiles.forEach(function(name){
            var url = '../../common-js/forge/' + name + '.js';
            $.getScript( url, function() {
                console.log( 'Loaded',url );
                if( ++filesLoaded == jsfiles.length )
                    ajaxReady = true;
            });  
        });      

        $.ajaxSetup({
            beforeSend: function(xhr, settings) {

                // make sure url is full path
                var url = new URL( settings.url, document.URL );

                // collect the header data
                var date = new Date().toUTCString();
                var method = settings.type;
                //var url = settings.url;
                var host = window.location.host;

                // create the secret from my bot private key and the users cards public key
                // NOTE: This is precomputed by setup.js for this shim
                var hmacSecret = shimData.bots[botname].hmacSecret;

                // create the preamble
                var search = url.search ? url.search : '';
                var preamble = method + ' ' + url.pathname + search + '\n' + host + '\n' + date + '\n';
                console.log( "Preamble " + preamble );

                // start hashing...
                var hmac = forge.hmac.create();
                hmac.start('sha256', hmacSecret );
                hmac.update(preamble);
                if (settings.data) 
                  hmac.update( settings.data );

                var primeUser = shimData.users[0];   // shims always have at least one user
                var cid = primeUser.card.cid;
                var tid = shimData.thread.tid;
                var ckid = Object.keys(primeUser.cryptos)[0];
                var bkid = Object.keys(shimData.bots[botname].cryptos)[0];

                var sig = forge.util.encode64( hmac.digest().bytes() );
                var auth = 'CB-HMAC algo=sha256,cid=' + cid + ',tid=' + tid + ',ckid=' + ckid + ',bkid=' + bkid + ',headers=Host;X-Mobido-Date,sig=' + sig;
                
                xhr.setRequestHeader('X-Mobido-Authorization',auth);
                xhr.setRequestHeader('X-Mobido-Date',date);

                return true;
            }
        });
    }
                 
    return my;
}());

// example callbacks, change callback object with BotWidgetHost.setCallbackObjectName("nameofobject")
BotWidgetCallbacks = (function() {
    var my = {};

    //===== What is execution environment ===

    my.onEnvironment = function(env) {
        console.log("onEnvironment",env);   
    }

    my.onViewWillAppear = function() {
        console.log("onViewWillAppear");
    }
    
    //===== Thread callbacks =====
    
    my.onThread = function(thread) {
        console.log("onThread",thread);
    }

    my.onThreadList = function(list) {
        console.log("onThreadList",list);
    }
    
    my.onMessageHistory = function(handle,messages) {
        console.log("onMessageHistory",handle,messages);
    }
    
    // One or more messages have arrived
    my.onIncomingMessage = function(msg) {
        console.log("onIncomingMessage", msg);
    }

    my.onSignal = function(key,value) {
        console.log("onSignal", key, JSON.stringify(value) );
    }
    
    // Thread has changed in some way, usually cards added/removed
    my.onThreadUpdated = function() {
        console.log("onThreadUpdated");
    }

    // Result from ensuring a chat exists between the current card/persona and a public bot/card
    // f(failure,thread)
    // failure is null for success or { code:#, message:'description' }
    // thread is { tid: ... }
    my.onExclusiveChat = function(failure,thread) {
        console.log("onExclusiveChat");
    }

    //===== Calendar callbacks ======

    my.onFreeBusy = function(access,schedule) {
        console.log("onFreeBusy",access,schedule);   
    }

    my.onFreeBusyRequest = function(access) {
        console.log("onFreeBusyRequest",access);   
    }

    //===== Option menu selections =====

    my.onOptionItemSelected = function(handle,item) {
        console.log("onOptionItemSelected",handle,item);
    }

    my.onBackButton = function() {
        console.log("onBackButton" );
    }
    
    //===== Card callbacks =====
                      
    // Reply to getThreadCards()
    my.onThreadCards = function(cards) {
        console.log("onThreadCards",cards);
    }
                      
    // Reply to getUserCard()
    my.onUserCard = function(card) {
        console.log("onUserCard",card);
    }
    
    // Reply to getBotCard()
    my.onBotCard = function(card) {
        console.log("onBotCard",card);
    }

    my.onUserCardSelected = function(failure,card) {
        console.log("onUserCardSelected",card);
    }
    
    //====== Bot Server callbacks =====
    
    my.onBotServerJsonResponse = function(handle,result) {
        console.log("onBotServerJsonResponse",handle,result);
    }
    
    my.onBotServerRawResponse = function(handle,content,contentType) {
        console.log("onBotServerRawResponse",handle,err,status,content,contentType);
    }
    
    my.onBotServerErrorResponse = function(handle,err,status) {
        console.log("onBotServerErrorResponse",handle,err,status);
    }

    //===== Location Callbacks =====

    my.onLocation = function(geo) {
        console.log("onLocation",geo);
    }
                      
    return my;
}());