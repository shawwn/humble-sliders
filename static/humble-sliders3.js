( function( $ ) {
  'use strict';

  var SliderModel = Backbone.Model.extend( {
    defaults: {
      pennies: 0,
      percent: 0.0,
      children: []
    },
    initialize: function() {
      _.bindAll( this,
        'get_human_amount',
        'get_children',
        'add_child',
        'get_siblings',
        'distribute_unused_pennies',
        'child_to_distribute_to',
        'propagate_up_from_children'
        );
      this.set( { 'children': [] } );
    },
    get_human_amount: function() {
      return pennies2money( this.get( 'pennies' ) );
    },
    get_children: function() {
      return this.get( 'children' );
    },
    add_child: function( model ) {
      this.get_children().push( model )
    },
    get_siblings: function() {
      // get my parent.
      var parent_model;
      {
        parent_model = this.get( 'parent_model' );
        if ( parent_model === null ) {
          return [];
        }
      }

      // iterate over my parent's children, skipping myself,
      // appending each to the siblings array.
      var siblings = [];
      {
        var parent_children = parent_model.get_children();
        for ( var i = 0; i < parent_children.length; i++ ) {
          if ( parent_children[ i ] == this ) {
            continue;
          }
          siblings.push( parent_children [ i ] );
        }
      }
      return siblings;
    },
    distribute_unused_pennies: function() {
      // sum my children's pennies.
      var children_pennies = 0.0;
      var children = this.get_children();
      for ( var i = 0; i < children.length; i++ ) {
        children_pennies += children[ i ].get( 'pennies' );
      }

      // determine the number of unused pennies.
      var unused_pennies = ( this.get( 'pennies' ) - children_pennies );

      // distribute each unused penny to my children.
      {
        // for each penny...
        for ( var i = 0; i < unused_pennies; i++ ) {
          // determine the best child to distribute to.
          var child = this.child_to_distribute_to();

          // add the penny to that child.
          child.set( {
            'pennies': ( child.get( 'pennies' ) + 1 )
          } );
        }
      }
    },
    child_to_distribute_to: function() {
      var pennies = this.get( 'pennies' );

      // for each child...
      var score = 0.0;
      var to = null;
      var children = this.get_children();
      for ( var i = 0; i < children.length; i++ ) {

        // determine the child's ideal (floating-point) value.
        var child_percent = children[ i ].get( 'percent' );
        var ideal = ( child_percent * pennies );

        // determine the child's actual (integer) value.
        var actual = children[ i ].get( 'pennies' );

        // if the distance between the ideal and actual value is
        // greater than the previous max, then this child becomes
        // the child to use.
        var distance = Math.abs( actual - ideal );
        if ( distance >= score ) {
          score = distance;
          to = children[ i ];
        }
      }

      return to;
    },
    propagate_up_from_children: function() {
      // get my parent.
      var parent_model = this.get( 'parent_model' );
      if ( parent_model === undefined ) {
        return;
      }
      var parent_children = parent_model.get_children();

      // sum the pennies from myself and all of my siblings.
      var sum_pennies = 0;
      for ( var i = 0; i < parent_children.length; i++ ) {
        sum_pennies += parent_children[ i ].get( 'pennies' );
      }

      // set my parent's value.
      parent_model.set( {
        'pennies': sum_pennies
      } );

      // recompute percentages.
      for ( var i = 0; i < parent_children.length; i++ ) {
        var child_pennies = parent_children[ i ].get( 'pennies' );
        parent_children[ i ].set( {
          'percent': ( child_pennies / sum_pennies )
        } );
      }

      // continue propagating up the hierarchy.
      parent_model.propagate_up_from_children();
    }
  } );

  var SliderView = Backbone.View.extend( {
    text_input: null,
    slider_div: null,
    increments: 1000,
    events: {
      'mousedown .ui-slider': 'slid',
      'slide': 'slid',
      'slidestop': 'slid',
      'change': 'edited'
    },
    initialize: function() {
      _.bindAll( this,
        'slid',
        'edited',
        'render'
        );
      var parent_model = this.options[ 'parent_model' ];

      // add my model.
      {
        this.model = new SliderModel( {
          pennies: this.options[ 'pennies' ],
          percent: this.options[ 'percent' ],
          parent_model: parent_model
        } );
        parent_model.add_child( this.model );
      }

      // initialize my UI elements.
      {
        // initialize my slider.
        this.slider_div = $( this.el ).find( '.slider-placeholder' );
        var percent = this.model.get( 'percent' );
        initPercentSlider( this.slider_div, percent, this.increments );

        // initialize my text input.
        this.text_input = $( this.el ).find( '.slider-pennies' );
      }

      // when my model changes, re-render me.
      {
        this.model.on( 'change:pennies', this.render );
        this.model.on( 'change:percent', this.render );
      }

      // for each child split...
      {
        // add a corresponding slider.
      }

      this.render();
    },
    render: function() {
      // display my slider's value as my model's percent.
      {
        var value = ( this.increments * this.model.get( 'percent' ) );
        $( this.slider_div ).slider( 'value', value );
      }

      // display my text input's value as determined by my model.
      {
        $( this.text_input ).val( this.model.get_human_amount() );
      }
    },
    slid: function( event, ui ) {
      event.stopPropagation();

      // get my slider's percent.
      var percent = 0.0;
      {
        var value = getSliderValue( ui, this.slider_div );
        percent = ( value / this.increments );
      }

      // get my parent's value.
      var parent_model = this.model.get( 'parent_model' );
      var parent_pennies = parent_model.get( 'pennies' );

      // set my new value.
      this.model.set( {
        'pennies': parseInt( parent_pennies * percent )
      } );

      // recompute my percentage.
      this.model.set( {
        'percent': ( this.model.get( 'pennies' ) / parent_pennies )
      } );

      // normalize my siblings' percentages, distributing the
      // leftover value based on the nomalized weights.
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
        var leftover = ( parent_pennies - this.model.get( 'pennies' ) );

        // for each sibling...
        for ( var i = 0; i < siblings.length; i++ ) {
          var percent = siblings[ i ].get( 'percent' );

          // normalize the sibling percent.
          if ( percent_sum == 0.0 ) {
            percent = ( 1.0 / siblings.length );
          } else {
            percent /= percent_sum;
          }

          // distribute the leftover value proportional to the
          // normalized percent.
          siblings[ i ].set( {
            'pennies': parseInt( percent * leftover )
          } );

          // recompute the sibling percentage.
          siblings[ i ].set( {
            'percent': ( siblings[ i ].get( 'pennies' ) / parent_pennies )
          } );
        }
      }

      // distribute unused pennies to siblings.
      parent_model.distribute_unused_pennies();
    },
    edited: function( event ) {
      event.stopPropagation();

      // set my new value.
      var pennies = money2pennies( getTextValue( this.text_input ) );
      this.model.set( {
        'pennies': pennies
      } );

      // propagate changes up the hierarchy.
      this.model.propagate_up_from_children();
    }
  } );

  var HumbleSliders = Backbone.View.extend( {
    initialize: function() {
      this.splits = this.options[ 'params' ][ 'splits' ];
      var allotments = this.options[ 'params' ][ 'allotments' ];

      // add my model.
      {
        this.model = new SliderModel( {
          'pennies': this.options[ 'initial_pennies' ]
        } );
      }

      // add my template.
      {
        templateReplace( this.el, '#sliders-template', {
          'initial_value': this.model.get_human_amount()
        } );
      }

      // for each split...
      {
        var holder = $( this.el ).find( '.children-holder' );
        for ( var i = 0; i < this.splits.length; i++ )
        {
          var human_name = this.splits[ i ][ 'name' ];
          var machine_name = this.splits[ i ][ 'class' ];
          var has_children = this.splits[ i ].hasOwnProperty( 'splits' );

          // determine the initial amount of this split.
          var pennies = 0;
          var percent = 0.0;
          {
            // determine the initial percentage.
            if ( this.splits[ i ].hasOwnProperty( 'percent' ) ) {
              percent = this.splits[ i ][ 'percent' ];
            } else {
              percent = allotments[ 'default' ][ machine_name ];
            }

            // multiply by total amount.
            pennies = percent * this.model.get( 'pennies' );
          }

          // add a corresponding slider.
          {
            new SliderView( {
              el: templateAppend( holder, '#slider-template', {
                'human_name': human_name,
                'has_children': has_children,
              } ),
              parent_model: this.model,
              params: this.splits[ i ],
              pennies: pennies,
              percent: percent
            } );
          }
        }
      }
    }
  } );

  window.humbleSliders = function( pennies, container, params ) {
    return new HumbleSliders( {
      el: container,
      params: params,
      initial_pennies: pennies
    } );
  }

  function money2pennies( txt ) {
    return parseInt( txt.replace( /[^0-9]/gi, '' ) );
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

  function initPercentSlider( slider_div, value, incrs ) {
    $( slider_div ).slider( {
      'min': 0,
      'max': incrs,
      'value': ( value * incrs )
    } );
    return slider_div;
  }

  function getSliderValue( ui, slider_div ) {
    if ( ui == undefined ) {
      return slider_div.slider( 'option', 'value' );
    } else {
      return ui.value;
    }
  }

  function getTextValue( text_input ) {
    return $( text_input )[ 0 ].value;
  }

} )( jQuery );

