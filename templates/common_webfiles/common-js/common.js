$(function() {
    $('#error_bar .cancel').click(function(e){
        $('#error_bar').hide();
    });

    $('#success_bar .cancel').click(function(e){
        $('#success_bar').hide();
    });
});

function showSuccess(message) {
    $('#success_bar .message').text(message);
    $('#success_bar').show();
}

function hideSuccess() {
    $('#success_bar').hide();    
}

function showError(message) {
    $('#error_bar .message').text(message);
    $('#error_bar').show();
}

function hideError() {
    $('#error_bar').hide();    
}

// r = { cid:, nickname: }  where nickname is optional and the fallback
function resolveUsername( r, cards ) {
    console.log( 'r', r, cards );
    if( cards ) {
        for( var i = 0; i < cards.length; i++ ) {
            var c = cards[i];
            if( c.cid == r.cid )
                return c.nickname;
        }
    }

    // either no thread cards, or cid wasn't in list, can we fallback to nickname?
    return r.nickname ? r.nickname : 'Unknown';
}

var thisYear = new Date().getYear();
function formatDate(iso8601) {
    var date = new Date( iso8601 )
    var options = {weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'};
    if( date.getYear() != thisYear )
        options.year = 'numeric';
    return date.toLocaleString([], options );   
}