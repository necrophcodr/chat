jQuery(document).ready(function($) {

  var socket = io();
  var connected = false;
  var nick;
  var channels = {};

  function setContainerHeight() {
    var viewHeight      = $(window).innerHeight(),
        wrapperOffset   = $('div.wrap').offset().top,
        footerHeight    = $('footer').height(),
        leftOver        = 152, // message input + paddings
        calcHeight      = viewHeight - wrapperOffset - footerHeight - leftOver;
    $('#channel-containers').css('height', calcHeight);
  }

  setContainerHeight();

  // Take care of screen resizes for chat window.
  $(window).on('resize', function() {
    setContainerHeight();
  });

  // Switch channel on hash change.
  $(window).on('hashchange', function() {
    var channel = location.hash || '#root';

    var channelEl = $('div[data-channel="' + channel + '"]');

    if (channelEl.length > 0) {

      // Remove selected state on anchors.
      $('a.channelLink').removeClass('selected');

      // Hide all other channels.
      $('#channel-containers div.channel').removeClass('hidden').addClass('hidden');

      // Select current channel.
      $('li[data-channel="'+ channel +'"] .channelLink').addClass('selected');

      // Show current channel.
      channelEl.removeClass('hidden');

    }
  });

  function appendHTML(containers, html) {
    containers.each(function(i, el) {
      $(el).append(html);
    });
  }

  // Escape HTML from: https://github.com/janl/mustache.js/blob/master/mustache.js#L43
  var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
  };

  function escapeHTML(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
  }

  function createAlert(opts) {
    console.log('creating Alert', opts);
    var msg       = opts.msg,
        level     = opts.level,
        label     = opts.label,
        container = $('.alert-container'),
        html;

    html = '<div data-alert class="alert-box ctext radius ' + level + ' ' + label + '">' +
           '<span class="alert-text">' + msg + '</span>' +
           '<a class="close">&times;</a>' +
           '</div>';

    container.append(html).foundation();

    $('.alert-box.' + label).show();
  }

  function closeAlert(label) {
    $('.alert-box.'+label).remove();
  }

  function postToChannel(msgObj) {

    console.log('post to channel', msgObj);

    var channel    = msgObj.channel,
        nick       = msgObj.nick,
        msg        = escapeHTML(msgObj.msg),
        type       = msgObj.type,
        when       = (msgObj.when ? moment(msgObj.when).format('YYYY-MM-DD h:mm:ss') : undefined),
        chanMsgs,
        containers,
        html;

    // If no channel is provided send to all channels.
    if (channel) {
      // Keep a copy of message.
      chanMsgs = channels[channel].messages;
      if (chanMsgs) {
         channels[channel].messages.push(msgObj);
      } else {
         channels[channel].messages = [msgObj];
      }

      containers = $('#channel-containers div[data-channel="' + channel + '"] div.messages ul');

    } else {
      containers = $('#channel-containers div ul');
    }

    switch (type) {
      case 'system':
        html = '<li class="message system_msg"><span class="timestamp">' + when + '</span>' + msg + '</li>';
        appendHTML(containers, html);
        break;

      case 'user':
        html = '<li class="message '+ type +'" data-to="' + channel +  '">' +
               '<span class="timestamp">' + when + '</span>' +
               '<span class="nick">' + nick + '</span>: <span class="text">' + msg + '</span></li>';
        appendHTML(containers, html);
        break;

      default:
        break;
    }

    // Keep scroll at bottom of channel window.
    var scrollArea = $('div.channel[data-channel="' + channel + '"]');
    if (scrollArea.length > 0) {
      var scrollTop  = scrollArea[0].scrollHeight;
      scrollArea.animate({'scrollTop': scrollTop}, 'slow');
    }

  }

  // Connecting to IRC from web.
  $('form.connect').on('valid.fndtn.abide', function() {
    var server   = $('input[name=server]').val(),
        channels = $('input[name=channels]').val();

    nick = $('input[name=nickName]').val();

    socket.emit('connectToIRC', {
      server  : server,
      channels: channels,
      nick    : nick
    });

    $('a.close-reveal-modal').click();

    closeAlert('disconnected');
    setTimeout(function() {
      createAlert({ msg: 'Connecting ...', level: 'warning', label: 'connecting'});
    }, 500);

    return false;
  });

  // Sending message from web.
  $('form.send').submit(function(e) {
    if (e) e.preventDefault();

    var el  = $('input[name=message]');
    var val = el.val();

    // Get the channel from the URL
    var channel = location.hash || '#root';
    var msg     = val;

    if (msg) {
      socket.emit('webMessage', {
        channel : channel,
        msg     : msg
      });
      el.val('');
    }

    var msgObj = {
      msg     : msg,
      nick    : nick,
      when    : moment(),
      channel : channel,
      type    : 'user',
    };

    postToChannel(msgObj);

    return false;
  });

  socket.on('ircConnected', function(data) {
    console.log('info received', data);

    connected = true;
    nick      = data.nick;

    var when         = data.when,
        server       = data.server,
        serverMsg    = data.serverMsg,
        clientsCount = data.clientsCount;

    var msgObj = {
      channel : '#root',
      msg     : serverMsg,
      type    : 'system',
      when    : when,
    };

    // Empty out initial content.
    $('#channel-list').empty();
    $('#channel-containers').empty();

    // Hide alerts.
    $('.alert-box.connecting').remove();
    setTimeout(function() {
      createAlert({ msg: 'Connected! Joining rooms ...', level: 'success', label: 'connected' });
    }, 500);

    // Hide the connect and show the user menu.
    $('#connect').addClass('hidden');

    var menuHTML = '<a>Hi, ' + nick + '</a>' +
                   '<ul class="dropdown">'+
                   '<li><a id="disconnect">Disconnect</a></li>' +
                   '</ul>';
    $('.top-bar-section li.has-dropdown').append(menuHTML);

    $('#disconnect').on('click', function() {
      socket.emit('disconnectIRC');
      return false;
    });

    console.log('msgObj', msgObj);

    // Add the root channel.
    var channel     = '#root',
        channelHTML = '<div class="channel" data-channel="' + channel + '"><div class="messages"><ul class="no-bullet"></ul></div></div>',
        channelList = $('#channel-list'),
        linkHTML    = '<li data-channel="'+ channel +'" class="channel">' +
                      '<a href="' + channel  +'" class="channelLink button tiny radius">' + channel + '</a>' +
                      '</li>';

    channelList.append(linkHTML);

    $('#channel-containers').append(channelHTML);
    channels['#root'] = {};

    postToChannel(msgObj);

    // Show the post form.
    $('form.send').fadeIn('slow');
  });

  socket.on('ircMOTD', function(data) {
    console.log('ircMOTD', data);
    var motd = data.motd,
        when = data.when;

    var msgObj = {
      channel : '#root',
      msg     : motd,
      type    : 'system',
      when    : when,
    };

    postToChannel(msgObj);

  });

  socket.on('ircMessage', function(data) {
    var channel = data.to,
        msg     = data.text,
        nick    = data.nick,
        when    = data.when;

    console.log('message received', data);

    var msgObj  = {
      msg       : msg,
      nick      : nick,
      when      : when,
      channel   : channel,
      type      : 'user',
    };

    postToChannel(msgObj);

    console.log('channel messages', channels[channel].messages);

  });

  socket.on('ircJoin', function(data) {
    console.log('ircJoin', data);

    var channel   = data.channel,
        msg       = data.nick  + ' has joined channel: ' + channel,
        when      = data.when;

    var msgObj = {
      channel : channel,
      nick    : nick,
      msg     : msg,
      type    : 'system',
      when    : when,
    };

    var exists = channel in channels;
    if (!exists) {
      channels[channel] = {};
    }
    console.log('ircJoin channels', channels);

    postToChannel(msgObj);

    window.location.hash = channel;

    closeAlert('connected');

  });

  socket.on('ircNames', function(data) {
    var channel       = data.channel,
        nicks         = data.nicks,
        when          = data.when,
        nameContainer = $('div.channel[data-channel="' + channel + '"] div.names ul');

   console.log('ircNames', data);

   for (var nick in nicks) {
    var mode = nicks[nick];
    var nickHTML = '<li class="nick rtext"><span class="mode">' + mode + '</span> ' + nick + '</li>'
    nameContainer.append(nickHTML);
   }

  });

  socket.on('ircTopic', function(data) {
    var channel        = data.channel,
        topic          = data.topic,
        nick           = data.nick,
        when           = data.when,
        rawMsg         = data.message,
        topicContainer =  $('div.channel[data-channel="'+ channel +'"] div.topic');

    console.log('ircTopic', data);
    topicContainer.empty();
    topicContainer.append('<span>' + topic + '</span>');

    if (rawMsg.command === 'TOPIC') { // User called
      var msgObj = {
        channel: channel,
        msg    : nick + ' changed the topic to: ' + topic,
        type   : 'system',
        when   : when,
      };

      postToChannel(msgObj);
    }
  });

  socket.on('createChannel', function(data) {
    var channel          = data.channel,
        channelList      = $('#channel-list'),
        linkHTML         = '<li data-channel="'+ channel +'" class="channel">' +
                           '<a href="' + channel  +'" class="channelLink button tiny radius">' + channel + '</a>' +
                           '</li>',
        channelContainer = $('#channel-containers'),
        channelHTML      = '<div class="channel hidden row" data-channel="' + channel + '">'+
                             '<div class="topic"></div>' +
                             '<div class="small-9 columns messages">' +
                             '<ul class="no-bullet"></ul>' +
                             '</div>' +
                             '<div class="small-3 columns names">' +
                             '<ul class="no-bullet"></ul>' +
                             '</div>' +
                           '</div>';

    channels[channel] = {};
    console.log('channels', channels);

    channelList.append(linkHTML);
    channelContainer.append(channelHTML);

  });

  socket.on('ircPart', function(data) {
    console.log('ircPart', data);

  });

  socket.on('ircDisconnected', function(data) {
    console.log('disconnect received');
    connected = false;

    var when = data.when;

    var msgObj = {
      msg  : 'You were disconnected!',
      type : 'system',
      when : when,
    };

    postToChannel(msgObj);

    createAlert({ msg: 'Disconnected! Reconnect to continue chatting.', level : 'alert', label: 'disconnected' })

    // Remove user menu and show connect.
    $('li.has-dropdown').empty();
    $('#connect').removeClass('hidden');

  });

  socket.on('systemMessage', function(data) {
    var msg  = data.msg,
        type = data.type,
        when = data.when;
    console.log('*** sysMessage: ', msg, type, when);
  });

  socket.on('ircError', function(data) {
    var msg  = data.msg,
        when = data.when;

    console.log('*** ircError: ', msg, when);
  });

  socket.on('error', function() {
    console.log('error', arguments);
  });


  $(document).foundation();
});
