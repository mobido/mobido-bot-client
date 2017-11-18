var previousHeight;
setInterval(function() {
    var height = $(document).height();
    if( height && height != previousHeight ) {
        BotWidgetHost.setHeight(height); 
        previousHeight = height;   
    }
}, 200 );

$(function() {

});