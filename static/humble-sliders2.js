
( function( $ ) {
  'use strict';

  var AmountModel = Backbone.Model.extend( {
    defaults: {
      pennies: 0,
      children: []
    },
    initialize: function() {
      _.bindAll( this,
        'add_child',
        'get_children',
        'get_human_amount',
        'distribute_down',
        'propagate_down',
        'distribute_unused_pennies',
        'propagate_up'
        );
      this.set( { 'children': [] } );
      this.on( 'change:pennies', this.propagate_down, this );
    },
    add_child: function( model ) {
      this.get_children().push( model );
    },
    get_children: function() {
      return this.get( 'children' );
    },
    get_human_amount: function() {
      return pennies2money( this.get( 'pennies' ) ); 
    },
    distribute_down: function() {
      this.distribute_unused_pennies();
    },
    propagate_down: function() {
      var pennies = this.get( 'pennies' );
      var children = this.get_children();
      for ( var i = 0; i < children.length; i++ ) {
        var percent = children[ i ].get( 'split' );
        children[ i ].set( {
        'pennies': parseInt( pennies * percent )
        } );
      }
      this.distribute_unused_pennies();
    },
    distribute_unused_pennies: function() {
      var children = this.get_children();
      if ( children.length <= 0 ) {
        return;
      }
      var children_pennies = 0;
      for ( var i = 0; i < children.length; i++ ) {
        children_pennies += children[ i ].get( 'pennies' );
      }
      var unused_pennies = this.get( 'pennies' ) - children_pennies;
      for ( var i = 0; i < unused_pennies; i++ ) {
        var target_child = this.distribute_target_child();
        if ( !target_child ) {
          break;
        }
        target_child.set( {
          'pennies': ( parseInt( target_child.get( 'pennies' ) ) + 1 )
        } );
      }
    },
    distribute_target_child: function() {
      var children = this.get_children();
      if ( children.length <= 0 ) {
        return;
      }
      var parent_pennies = this.get( 'pennies' );
      var difference = 0;
      var target_child = null;
      for ( var i = 0; i < children.length; i++ ) {
        var child_pennies = children[ i ].get( 'pennies' );
        var child_percent = children[ i ].get( 'split' );
        var ideal_pennies = ( child_percent * parent_pennies );
        if ( ideal_pennies > 0 ) {
          var missing_pennies = ideal_pennies - child_pennies;
          if ( missing_pennies > difference ) {
            difference = missing_pennies;
            target_child = children[ i ];
          }
        }
      }
      return target_child;
    },
    propagate_up: function() {
      var parent_model = this.get( 'parent_model' );
      if ( !parent_model ) {
        return;
      }
      var parent_children = parent_model.get_children();
      var pennies = 0;
      for ( var i = 0; i < parent_children.length; i++ ) {
        pennies += parent_children[ i ].get( 'pennies' );
      }
      for ( var i = 0; i < parent_children.length; i++ ) {
        parent_children[ i ].set( {
          'split': ( parent_children[ i ].get( 'pennies' ) / pennies )
        } );
      }
      parent_model.set( {
        'pennies': parseInt( pennies )
      } );
      parent_model.propagate_up();
    },
  } );

  var SliderModel = AmountModel.extend( {
    defaults: {
      machine_name: '',
      human_name: '',
      pennies: 0,
      split: 0.0,
      children: [], // needed?
      parent_model: null
    },
    initialize: function() {
      this.constructor.__super__.initialize.apply( this );
      var parent_pennies = this.get( 'parent_model' ).get( 'pennies' );
      this.set( {
        'pennies': parseInt( this.get( 'split' ) * parent_pennies )
      } );
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

      this.model.on( 'change:pennies', this.render );
      this.model.on( 'change:split', this.render );

      this.slider_div = $( this.el ).find( '.slider-placeholder' );
      $( this.slider_div ).slider( {
          'min': 0,
          'max': this.increments,
          'value': this.increments * this.model.get( 'split' )
      } );
      var parent_pennies = this.model.get( 'parent_model' ).get( 'pennies' );
      this.model.set( {
        'pennies': parseInt( parent_pennies * this.model.get( 'split' ) )
      } );

      var splits = this.options.splits;
      this.text_input = $( this.el ).find( '.slider-pennies' );
      var has_children = splits.hasOwnProperty( 'subsplit' );
      if ( !has_children ) {
        var name = ( 'split-' + this.model.get( 'machine_name' ) );
        $( this.text_input ).attr( 'name', name );
      }
      if ( has_children ) {
        var rendered = templateHTML( "#subsplit-holder-template", {} );
        var subsplit_holder = appendHTML( rendered, this.el );
        var order = splits[ 'subsplit' ];
        for ( var i = 0; i < order.length; i++ ) {
          var machine_name = order[ i ][ 'class' ];
          var human_name = order[ i ][ 'name' ];
          var has_children = order[ i ].hasOwnProperty( 'subsplit' );

          var split = order[ i ][ 'sibling_split' ];

          var sm = new SliderModel( {
            machine_name: machine_name,
            human_name: human_name,
            split: split,
            parent_model: this.model
          } );
          this.model.add_child( sm );

          var rendered = templateHTML( "#slider-template", {
            'human_name': human_name,
            'has_children': has_children
          } );
          var holder = $( subsplit_holder ).find( '.subsplit-wrapper' );
          new SliderView( {
            el: appendHTML( rendered, holder ),
            model: sm,
            splits: order[ i ]
          } );
        }
      }
      this.render();
    },
    slid: function( event, ui ) {
      event.stopPropagation();
      var value = getSliderValue( ui, this.slider_div );
      var percent = ( value / this.increments );
      var parent_model = this.model.get( 'parent_model' );
      var parent_pennies = parent_model.get( 'pennies' );
      var pennies = parseInt( percent * parent_pennies );
      this.model.set( {
        'split': percent,
        'pennies': pennies
      } );
      if ( parent_pennies == 0 ) {
        return;
      }
      var parent_children = parent_model.get_children();
      var other_percents = 0.0;
      for ( var i = 0; i < parent_children.length; i++ ) {
        if ( parent_children[ i ] == this.model ) {
          continue;
        }
        other_percents += parent_children[ i ].get( 'split' );
      }
      for ( var i = 0; i < parent_children.length; i++ ) {
        if ( parent_children[ i ] == this.model ) {
          continue;
        }
        var sibling_percent = parent_children[ i ].get( 'split' );
        console.log( other_percents );
        if ( other_percents == 0.0 ) {
          sibling_percent = ( 1.0 / ( parent_children.length - 1 ) );
        } else {
          sibling_percent /= other_percents;
        }
        var sibling_pennies = parseInt( sibling_percent * ( parent_pennies - pennies ) );
        parent_children[ i ].set( {
          'split': ( sibling_pennies / parent_pennies ),
          'pennies': sibling_pennies
        } );
      }
      this.render();
      parent_model.distribute_down();
      this.model.distribute_down();
    },
    edited: function( event ) {
      event.stopPropagation();
      var parent_model = this.model.get( 'parent_model' );
      var parent_pennies = parent_model.get( 'pennies' );
      var pennies = money2pennies( $( this.text_input )[ 0 ].value );
      var percent = ( pennies / parent_pennies );
      this.model.set( {
        //'split': percent,
        'pennies': pennies
      } );
      this.model.propagate_up();
    },
    render: function() {
      $( this.slider_div ).slider( 'value',
          this.increments * this.model.get( 'split' ) );
      $( this.text_input ).val( this.model.get_human_amount() );
    }
  } );

  var HumbleSliders = Backbone.View.extend( {
    defaults: {
      text_input: null
    },
    events: {
      'change .master-amount': 'pennies_change'
    },
    initialize: function() {
      _.bindAll( this,
        'pennies_change',
        'render'
        );
      this.splits = this.options[ 'splits' ];
      this.default_pennies = this.options[ 'default_pennies' ]
      this.model = new AmountModel( {
        'pennies': this.default_pennies
        } );
      var rendered = _.template( $( "#sliders-template" ).html(), {
        'initial_value': this.model.get_human_amount()
        } );
      $( this.el ).html( rendered );
      this.text_input = $( this.el ).find( '.master-amount' );

      var order = this.splits[ 'order' ];
      for ( var i = 0; i < order.length; i++ ) {
        var machine_name = order[ i ][ 'class' ];
        var human_name = order[ i ][ 'name' ];
        var has_children = order[ i ].hasOwnProperty( 'subsplit' );

        var split = 0.0;
        if ( has_children ) {
          split = order[ i ][ 'sibling_split' ];
        } else {
          split = this.splits[ 'split' ][ 'default' ][ machine_name ];
        }

        var sm = new SliderModel( {
          machine_name: machine_name,
          human_name: human_name,
          split: split,
          parent_model: this.model
        } );
        this.model.add_child( sm );

        var rendered = _.template( $( "#slider-template" ).html(), {
          'human_name': human_name,
          'has_children': has_children
        } );
        var holder = $( this.el ).find( '.splits-holder' );
        new SliderView( {
          el: appendHTML( rendered, holder ),
          model: sm,
          splits: order[ i ]
        } );
      }

      this.model.distribute_down();
    },
    pennies_change: function( event ) {
      this.model.set( {
          'pennies': money2pennies( $( this.text_input )[ 0 ].value )
      } );
    },
    render: function() {
      $( this.text_input ).val( this.model.get_human_amount() )
    }
  } );

  window.humbleSliders = function( pennies, container, splits ) {
    return new HumbleSliders( {
      el: container,
      default_pennies: pennies,
      splits: splits
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

  function appendHTML( txt, to ) {
    var html = $.parseHTML( txt.trim() );
    return $( html ).appendTo( to );
  }

  function getSliderValue( ui, slider_div ) {
    if ( ui == undefined ) {
      return slider_div.slider( 'option', 'value' );
    } else {
      return ui.value;
    }
  }

} )( jQuery );

