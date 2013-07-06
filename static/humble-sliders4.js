( function( $ ) {

  var SliderModel = Backbone.Model.extend( {
    defaults: {
      pennies: 0,
      percent: 0.0
    },
    initialize: function() {
      _.bindAll( this,
        'get_human_amount',
        'get_parent',
        'add_child',
        'get_children',
        'get_parent_children',
        'get_siblings',
        'distribute_unused_pennies',
        'get_child_to_give_penny',
        'propagate_up_from_children',
        'propagate_down_to_children'
        );

      // initialize my 'children' property to a unique, empty array.
      this.set( { 'children': [] } );

      // whenever my pennies are changed, push the new value down
      // to my children.
      this.on( 'change:pennies', this.propagate_down_to_children );
    },
    get_human_amount: function() {
      return pennies2money( this.get( 'pennies' ) );
    },
    get_parent: function() {
      return this.get( 'parent_model' );
    },
    add_child: function( child_model ) {
      this.get_children().push( child_model );
    },
    get_children: function() {
      return this.get( 'children' );
    },
    get_parent_children: function() {
      var siblings = this.get_siblings();
      siblings.push( this );
      return siblings;
    },
    get_siblings: function() {
      var siblings = [];

      // get my parent.
      var parent_model = this.get_parent();
      if ( parent_model !== undefined ) {

        // iterate over my parent's children, skipping myself, 
        // appending each to the siblings array.
        var parent_children = parent_model.get_children();
        for ( var i = 0; i < parent_children.length; i++ ) {
          if ( parent_children[ i ] != this ) {
            siblings.push( parent_children[ i ] );
          }
        }
      }
      return siblings;
    },
    distribute_unused_pennies: function() {
      var children = this.get_children();
      if ( children.length <= 0 ) {
        return;
      }

      // sum my children's pennies.
      var child_sum = 0;
      for ( var i = 0; i < children.length; i++ ) {
        child_sum += children[ i ].get( 'pennies' );
      }

      // determine unused pennies.
      var unused_pennies = ( this.get( 'pennies' ) - child_sum );
      
      // distribute each unused penny to children.
      for ( var i = 0; i < unused_pennies; i++ ) {
        
        // determine which child to give the penny to.
        var child = this.get_child_to_give_penny();

        // give the child a penny.
        child.set( {
          'pennies': ( child.get( 'pennies' ) + 1 )
        } );
      }
    },
    get_child_to_give_penny: function() {
      var pennies = this.get( 'pennies' );
      var children = this.get_children();

      // for each child...
      var score = 0.0;
      var to = null;
      for ( var i = 0; i < children.length; i++ ) {

        // determine the child's ideal (floating-point) value.
        var child_percent = children[ i ].get( 'percent' );
        var ideal = ( child_percent * pennies );

        // determine the child's actual (integer) value.
        var actual = children[ i ].get( 'pennies' );

        // if the distance between the ideal and actual value is
        // greater than or equal to the previous max, then this child
        // becomes the child to use.
        var distance = ( ideal - actual );
        if ( distance >= score ) {
          score = distance;
          to = children[ i ];
        }
      }

      return to;
    },
    propagate_up_from_children: function() {

      // get our parent's children.
      var parent_children = this.get_parent_children();

      // calculate the total sum of my parent's children.
      var parent_pennies = 0;
      for ( var i = 0; i < parent_children.length; i++ ) {
        parent_pennies += parent_children[ i ].get( 'pennies' );
      }

      // recompute each child's percentage.
      if ( parent_pennies > 0 ) {
        for ( var i = 0; i < parent_children.length; i++ ) {
          var child_pennies = parent_children[ i ].get( 'pennies' );

          parent_children[ i ].set( {
            'percent': ( child_pennies / parent_pennies )
          } );
        }
      }

      // propagate the change up my hierarchy.
      {
        var parent_model = this.get( 'parent_model' );
        if ( !parent_model ) {
          return;
        }

        // set my parent's pennies.
        parent_model.set( {
          'pennies': parent_pennies
        } );

        parent_model.propagate_up_from_children();
      }
    },
    propagate_down_to_children: function() {

      // get my new value.
      var pennies = this.get( 'pennies' );

      // recalculate each child's value.
      var children = this.get_children();
      for ( var i = 0; i < children.length; i++ ) {
        var child_percent = children[ i ].get( 'percent' );
        var child_pennies = parseInt( pennies * child_percent );
        children[ i ].set( {
          'pennies': child_pennies
        } );
      }

      // compensate for roundoff error.
      this.distribute_unused_pennies();
    },
  } );

  var SliderView = Backbone.View.extend( {
    slider_div: null,
    text_input: null,
    increments: 1000,
    events: {
      'mousedown .ui-slider': 'slid',
      'slide': 'slid',
      'slidestop': 'slid',
      'change': 'edited',
      'click .disclosure-triangle': 'toggle_children'
    },
    initialize: function() {
      _.bindAll( this,
        'render',
        'slid',
        'edited',
        'toggle_children'
        );
      this.params = this.options[ 'params' ];
      this.model = this.options[ 'model' ];

      // initialize my slider.
      this.slider_div = $( this.el ).find( '.slider-placeholder' );
      initPercentSlider( this.slider_div, this.increments );

      // initialize my text input.
      {
        this.text_input = $( this.el ).find( '.slider-pennies' );

        // set text input name.
        var name = ( 'amount-' + this.model.get( 'machine_name' ) );
        $( this.text_input ).attr( 'name', name );
      }

      // respond to changes in my model.
      this.model.on( 'change:pennies', this.render );
      this.model.on( 'change:percent', this.render );

      // make my children.
      var pennies = this.model.get( 'pennies' );
      makeChildrenFromParams( this.model, pennies, this.el, this.params );

      this.render();
    },
    render: function() {
      // render my slider's value as my model's percentage.
      var percent = this.model.get( 'percent' );
      setPercentSlider( this.slider_div, this.increments, percent );

      // render my text field's value as my model's amount.
      setTextInput( this.text_input, this.model.get_human_amount() );
    },
    slid: function( event, ui ) {
      event.stopPropagation();

      // parse my new percentage.
      var percent = getPercentSlider( this.slider_div, this.increments, ui );

      // get my parent's value.
      var parent_model = this.model.get( 'parent_model' );
      var parent_pennies = parent_model.get( 'pennies' );

      // set my new value.
      this.model.set( {
        'pennies': parseInt( parent_pennies * percent )
      } );

      // recompute my percentage.
      this.model.set( {
        'percent': percent
      } );

      // normalize my siblings' percentages, distributing the
      // leftover based on the nomalized percentages.
      {
        // get my siblings.
        var siblings = this.model.get_siblings();

        // sum my siblings' percents.
        var percent_sum = 0.0;
        {
          for ( var i = 0; i < siblings.length; i++ ) {
            percent_sum += siblings[ i ].get( 'percent' );
          }
        }

        // determine the leftover value.
        var leftover = ( 1.0 - percent );

        // for each sibling...
        for ( var i = 0; i < siblings.length; i++ ) {
          var percent = siblings[ i ].get( 'percent' );

          // normalize the sibling percent.
          if ( percent_sum == 0.0 ) {
            percent = ( 1.0 / siblings.length );
          } else {
            percent /= percent_sum;
          }

          // distribute the leftover proportional to the
          // normalized percent.
          siblings[ i ].set( {
            'percent': ( percent * leftover )
          } );

          // recompute the sibling value.
          var sibling_percent = siblings[ i ].get( 'percent' );
          siblings[ i ].set( {
            'pennies': parseInt( sibling_percent * parent_pennies )
          } );
        }
      }

      // distribute unused pennies to siblings.
      parent_model.distribute_unused_pennies();
    },
    edited: function( event ) {
      onEdited( this, event );
    },
    toggle_children: function( event ) {
      event.stopPropagation();

      // determine whether I was previously open.
      var was_open = $( event.target ).hasClass( 'disclosure-opened' );

      // get my children's container.
      var children_el;
      {
        var parent_el = $( event.target ).closest( '.slider-toplevel' );
        children_el = parent_el.find( '.children-holder' );
      }

      // toggle my children's container.
      if ( was_open ) {
        children_el.slideUp( 200 );
      } else {
        children_el.slideDown( 200 );
      }
      $( event.target ).toggleClass( 'disclosure-opened' );
    },
  } );

  var SlidersToplevelView = Backbone.View.extend( {
    text_input: null,
    events: {
      'change': 'edited'
    },
    initialize: function() {
      _.bindAll( this,
        'render',
        'edited'
        );
      this.params = this.options[ 'params' ];
      this.model = this.options[ 'model' ];

      // initialize my text field.
      this.text_input = $( this.el ).find( '.master-amount' );

      // respond to changes in my model.
      this.model.on( 'change:pennies', this.render );

      // make my children.
      var pennies = this.model.get( 'pennies' );
      makeChildrenFromParams( this.model, pennies, this.el, this.params );

      this.render();
    },
    render: function() {
      // render my text field's value as my model's amount.
      setTextInput( this.text_input, this.model.get_human_amount() );
    },
    edited: function( event ) {
      onEdited( this, event );
    },
  } );

  function onEdited( me, event ) {
    event.stopPropagation();
    
    // parse my new value from the text input.
    var pennies = money2pennies( getTextInput( me.text_input ) );

    // set my new value.
    me.model.set( {
      'pennies': pennies
    } );

    // propagate the change up my hierarchy.
    me.model.propagate_up_from_children();

    // re-render ourselves, to correct any editing typos.
    me.render();
  }

  function calcChildPercent( allotments, splits, i ) {
    var child_percent = splits[ i ][ 'percent' ];
    if ( child_percent === undefined ) {
      if ( allotments !== undefined ) {
        // if the percentage isn't specified directly, then try to
        // look up the percentage in the 'allotments' spec.
        var machine_name = splits[ i ][ 'class' ];
        child_percent = allotments[ 'default' ][ machine_name ];
      } else {
        // otherwise, if no allotments are specified, then split
        // evenly across all children.
        child_percent = ( 1.0 / splits.length );
      }
    }
    return child_percent;
  }

  function makeChildrenFromParams( parent_model, pennies, el, params ) {
    var splits = params[ 'splits' ];
    var allotments = params[ 'allotments' ];

    // if no children need to be created, do nothing.
    if ( splits === undefined ) {
      return;
    }

    // find the container to hold the children.
    var children_el = $( el ).find( '.children-holder' );

    // sum the child percentages.
    var sum_percents = 0.0;
    for ( var i = 0; i < splits.length; i++ ) {
      sum_percents += calcChildPercent( allotments, splits, i );
    }

    // for each split...
    for ( var i = 0; i < splits.length; i++ ) {
      var human_name = splits[ i ][ 'name' ];
      var machine_name = splits[ i ][ 'class' ];
      var has_children = ( splits[ i ][ 'splits' ] !== undefined );

      // determine the child's percentage.
      var child_percent = calcChildPercent( allotments, splits, i );

      // normalize the percentage.
      child_percent /= sum_percents;

      // determine the number of pennies to allocate to this child.
      var child_pennies = parseInt( child_percent * pennies );

      // create a model for the child and add it to the parent model.
      var child_model = new SliderModel( {
        'pennies': child_pennies,
        'percent': child_percent,
        'parent_model': parent_model,
        'machine_name': machine_name
      } );
      parent_model.add_child( child_model );


      // add the child's template.
      var template_el = templateAppend( children_el, '#slider-template', {
        'has_children': has_children,
        'human_name': human_name
      } );

      // create a view for the child.
      var child_view = new SliderView( {
        el: template_el,
        model: child_model,
        params: splits[ i ]
      } );
    }

    parent_model.distribute_unused_pennies();
  }

  window.humbleSliders = function( pennies, el, params ) {

    // make the toplevel model.
    var model = new SliderModel( {
      'pennies': pennies
    } );

    // add the toplevel template.
    var template_el = templateAppend( el, '#sliders-template', {
      'initial_value': model.get_human_amount()
    } );

    // make the toplevel view.
    return new SlidersToplevelView( {
      el: template_el,
      params: params,
      model: model
    } );
  }

  //
  // helper functions.
  //

  function money2pennies( txt ) {
    var non_digits = /[^0-9]/gi;

    // split by decimal.
    var splits = txt.split( '.', 2 );
    
    // parse dollars.
    var dollars = parseInt( splits[ 0 ].replace( non_digits, '' ) );

    // parse cents.
    var cents = 0;
    if ( splits.length > 1 ) {
      var cents_txt = splits[ 1 ].replace( non_digits, '' );

      var num_cents_places = 2;
      cents = parseInt( cents_txt.substring( 0, num_cents_places ) );
    }

    return ( ( 100 * dollars ) + cents );
  }

  function pad( num, places ) {
    var s = ( '' + num );
    while ( s.length < places ) {
      s = ( '0' + s );
    }
    return s;
  }

  function pennies2money( pennies ) {
    var s = '';
    var p = Math.round( pennies );
    var tail = ( p % 100 );
    p = Math.floor( p / 100 );
    while ( p > 0 ) {
      s = ( ',' + pad( p % 1000, 3 ) + s );
      p = Math.floor( p / 1000 );
    }
    s = ( s.replace( /,[0]*/, '' ) + '.' + pad( tail, 2 ) );
    return ( '$' + pad( s, 4 ) );
  }

  function templateHTML( id, vars ) {
    return _.template( $( id ).html(), vars );
  }

  function appendHTML( dst, txt ) {
    var html = $.parseHTML( txt.trim() );
    return $( html ).appendTo( dst );
  }

  function replaceHTML( dst, txt ) {
    var html = $.parseHTML( txt.trim() );
    $( dst ).html( html );
    return dst;
  }

  function templateAppend( dst, id, vars ) {
    var rendered = templateHTML( id, vars );
    return appendHTML( dst, rendered );
  }

  function templateReplace( dst, id, vars ) {
    var rendered = templateHTML( id, vars );
    return replaceHTML( dst, rendered );
  }

  function initPercentSlider( slider_div, incrs ) {
    $( slider_div ).slider( {
      'min': 0,
      'max': incrs,
      'value': 0
    } );
    return slider_div;
  }

  function setPercentSlider( slider_div, incrs, value ) {
    $( slider_div ).slider( 'value', ( incrs * value ) );
    return slider_div;
  }

  function getPercentSlider( slider_div, incrs, ui ) {
    var value = getSliderValue( slider_div, ui );
    return ( value / incrs );
  }

  function getSliderValue( slider_div, ui ) {
    if ( ui == undefined ) {
      return slider_div.slider( 'option', 'value' );
    } else {
      return ui.value;
    }
  }

  function setTextInput( text_input, value ) {
    $( text_input ).val( value );
    return text_input;
  }

  function getTextInput( text_input ) {
    return $( text_input )[ 0 ].value;
  }

} )( jQuery );

