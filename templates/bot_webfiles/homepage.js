// this is the current persona I'm using
var userCard;

//===== Once all the scripts are loaded... =====
$(function() {

    initMap();

    // pretty up our screen
    BotWidgetHost.setupScreen( { header_background: 0x4594ff, header_tint: 0xffffff } );

    /* build out the 'more options' menu
    var options = { items:[
            { label:"Community Stress", url:"index.html" }
        ] };
    BotWidgetHost.setOptionItems( options );
    */

    // if they've already picked a card, show it AND make sure we have a chat with them
    BotWidgetCallbacks.onUserCard = function(card) {
        showSelectedUserCard(card);
    }
    BotWidgetHost.fetchUserCard();

    /* Where am I?
    BotWidgetCallbacks.onLocation = function(geoloc) {
        if( centerMapWithLocation ) {
            botMap.panTo(geoloc);
            centerMapWithLocation = false;
        }

        if( window.stateMachine.onLocation ) {
            window.stateMachine.onLocation(geoloc);
        }
    }
    BotWidgetHost.fetchLocation();  */

    // ===== handle UI interactions =====

    $('#select_persona_button').click(function(e){
        BotWidgetHost.selectUserCard({ title:"Who do you want to be today?" }); 
    });

    BotWidgetCallbacks.onUserCardSelected = function(failure,card) {
        if(failure)
            showError('Failed to select user card: ' + failure);  
        if(card)
            showSelectedUserCard(card);
    }

    $('#start_chat_button').click(function(e){
        var options = { subject: "Create a chat between me and " + card.nickname, updateRestClient:true };
        BotWidgetHost.ensureExclusiveChat( options );       
    });

    BotWidgetCallbacks.onExclusiveChat = function(failure,thread) {
        if(failure)
            showError('Failed to create chat:' + failure);  
        if(thread)
            showSuccess('Created chat:', thread );
    };

    // ===== GeochatBot server interactions =====

    BotWidgetCallbacks.onBotServerJsonResponse = function(handle,result) {
        switch(handle) {
            case 'shareLocation':
                break;
        }
    };

    BotWidgetCallbacks.onBotServerErrorResponse = function(handle,err,status) {
        switch(handle) {
            case 'shareLocation':
                showError('Failed to search: ' + err.message);
                break;
        }
    };
});

// after a new persona has been selected, update the screen
function showSelectedUserCard(card) {
    userCard = card;
    $('#nickname').text( card.nickname );
}

function hideStatusBars() {
    $('#error_bar').hide();
    $('#success_bar').hide();   
}

function clearPath() {
    $('#form_spinner').hide();
}


