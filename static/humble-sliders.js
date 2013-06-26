
(function ($) {
  'use strict';

  var AmountModel = Backbone.Model.extend({
    defaults: {
      amount_pennies: 0,
      sibling_split: 1.0,
      child_slider_models: [],
      default_sibling_split: 0,
    },
    initialize: function() {
      _.bindAll(this,
        'add_child',
        'get_siblings',
        'get_children',
        'get_child_to_add_to',
        'get_human_amount',
        'distribute_pennies_down_one_level',
        'reset_to_default_sibling_split',
        'propagate_amount_change_down',
        'propagate_amount_change_up',
        'tree_to_json',
        'load_from_json',
        'flatten_percentage_tree'
      );
      this.set({'child_slider_models': []})
      this.on('change:amount_pennies', this.propagate_amount_change_down, this);
    },
    add_child: function(slider_model) {
      var new_children = this.get_children();
      new_children.push(slider_model);
    },
    get_siblings: function() {
      return []; // AmountModels have no siblings, only children
    },
    get_children: function() {
      return this.get('child_slider_models');
    },
    get_child_to_add_to: function () {
      var all_children = this.get_children();
      var max_difference = 0;
      var most_wrong_child = null;

      for (var i = 0; i < all_children.length; i++){
        var ideal_amount = all_children[i].get('sibling_split') * this.get('amount_pennies');
        var missing_amount = ideal_amount - all_children[i].get('amount_pennies');
        if (missing_amount > max_difference && ideal_amount != 0) { // never add to a child that should be a 0 anyway
          most_wrong_child = all_children[i];
          max_difference = missing_amount;
        }
      }
      return most_wrong_child;
    },
    get_human_amount: function () {
      return moneyfmt(parseInt(this.get('amount_pennies')) / 100);
    },
    distribute_pennies_down_one_level: function () {
      var children_sum = 0;
      var children = this.get_children();
      if (children.length <= 0) {
        return;
      }
      for (var i = 0; i < children.length; i++) {
        children_sum += children[i].get('amount_pennies');
      }
      var unused_pennies = this.get('amount_pennies') - children_sum;
      for (var i = 0; i < unused_pennies; i++){
        // unused pennies is guaranteed to be less than the number of children.
        var add_to_this_child = this.get_child_to_add_to();
        if (!add_to_this_child) {
          break;
        }
        var old_amount = add_to_this_child.get('amount_pennies');
        var new_amount = old_amount + 1;
        add_to_this_child.set({
          'amount_pennies': parseInt(new_amount)
        });
      }
    },
    reset_to_default_sibling_split: function () {
      var default_sibling_split = this.get('default_sibling_split');
      var parent_obj = this.get('parent_obj_model');
      var parent_amount_pennies = parent_obj.get('amount_pennies')
      this.set({
        'sibling_split': default_sibling_split,
        'amount_pennies': parseInt(parent_amount_pennies * default_sibling_split)
      });
      var children = this.get_children();
      for (var i = 0; i < children.length; i++) {
        children[i].reset_to_default_sibling_split();
      }
    },
    propagate_amount_change_down: function () {
      var children = this.get_children();
      var parent_amount = this.get('amount_pennies');
      for (var i = 0; i < children.length; i++) {
        var my_sibling_split = children[i].get('sibling_split');
        children[i].set({
          'amount_pennies': parseInt(parent_amount * my_sibling_split)
        });
      }
      this.distribute_pennies_down_one_level();
    },
    propagate_amount_change_up: function () {
      var my_amount_pennies = this.get('amount_pennies');
      var siblings = this.get_siblings();

      var new_parent_amount_pennies = my_amount_pennies;
      for (var i = 0; i < siblings.length; i++) {
        new_parent_amount_pennies += siblings[i].get('amount_pennies');
      }

      this.set({
        'sibling_split': my_amount_pennies / new_parent_amount_pennies
      })
      for (var i = 0; i < siblings.length; i++) {
        var this_siblings_amount = siblings[i].get('amount_pennies');
        siblings[i].set({
          'sibling_split': this_siblings_amount / new_parent_amount_pennies
        })
      }

      var parent_model = this.get('parent_obj_model');
      if (!parent_model) {
        return;
      }
      parent_model.set({
        'amount_pennies': parseInt(new_parent_amount_pennies)
      })
      parent_model.propagate_amount_change_up();
    },
    tree_to_json: function () {
      var me = {
        amount_pennies: this.get('amount_pennies'),
        sibling_split: this.get('sibling_split'),
        subsplits: []
      }
      var children = this.get_children();
      for (var i = 0; i < children.length; i++) {
        me['subsplits'].push(children[i].tree_to_json());
      }
      return me;
    },
    load_from_json: function (to_load) {
      this.set({
        'amount_pennies': parseInt(to_load['amount_pennies']),
        'sibling_split': to_load['sibling_split']
      });
      var model_children = this.get_children();
      for (var i = 0; i < to_load['subsplits'].length; i++) {
        var sub_tree = to_load['subsplits'][i];
        model_children[i].load_from_json(sub_tree);
      }
    },
    flatten_percentage_tree: function (prev_level_global_percent) {
      // recurses down a tree of AmountModels and builds a dict of global split percentages
      var results = {};
      var children = this.get_children();
      var my_split_machine_name = this.get('split_machine_name');
      if (prev_level_global_percent === undefined) {
        prev_level_global_percent = 1.0;
      }
      var my_level_global_percent = this.get('sibling_split') * prev_level_global_percent;
      if (children.length == 0) {
        var to_return = {};
        to_return['split-' + my_split_machine_name] = (my_level_global_percent * 100.0); // HumbleSubmitHandler wants 0-100 percentages
        return to_return;
      } else {
        for (var i = 0; i < children.length; i++) {
          results = merge_objects(results, children[i].flatten_percentage_tree(my_level_global_percent));
        }
        return results;
      }
    }
  });

  var SingleSliderModel = AmountModel.extend({
    defaults: {
      split_human_name: '',
      split_machine_name: '',
      amount_pennies: 0,
      sibling_split: 0.0, // a decimal percent e.g. 0.25
      child_slider_models: [],
      parent_obj_model: null // can be either the AmountModel or a Slider Model.
      // The top level sliders have the AmountModel as parent.
    },
    initialize: function () {
      this.constructor.__super__.initialize.apply(this);
      var parent_obj = this.get('parent_obj_model');
      this.set({'amount_pennies': parseInt(this.get('sibling_split') * parent_obj.get('amount_pennies'))})
    },
    get_siblings: function () {
      var parent = this.get('parent_obj_model');
      var siblings = [];
      if (parent === null) {
        return [];
      }
      var all_sliders_on_my_level = parent.get_children();
      for (var i = 0; i < all_sliders_on_my_level.length; i++) {
        if (all_sliders_on_my_level[i] != this) {
          siblings.push(all_sliders_on_my_level[i]);
        }
      }
      return siblings;
    }
  });

  var SingleSliderView = Backbone.View.extend({
    text_input: null,
    slider_div: null,
    slider_increments: 1000,

    initialize: function () {
      _.bindAll(this,
              'render',
              'slider_moved',
              'amount_edited_directly'
      ); // fixes loss of context for 'this' within methods

      // the dict defining all children of this slider
      var sub_split_dict = this.options.sub_split_dict;

      // bind render to changes on the model.
      this.model.on('change:sibling_split', this.render)
      this.model.on('change:amount_pennies', this.render)

      // set up my visible slider input
      this.slider_div = $(this.el).find('.slider-placeholder');
      $(this.slider_div).slider({
        //'animate': true,  // TODO: Uncomment this once we figure out why it's not working. Keep in mind this breaks IE if we're not careful.
        'min': 0,
        'max': this.slider_increments,
        'value': this.slider_increments * this.model.get('sibling_split')
      });
      this.model.set({
        'amount_pennies': parseInt(this.model.get('parent_obj_model').get('amount_pennies') * this.model.get('sibling_split'))
      })
      this.text_input = $(this.el).find('.slider-amount');
      var has_children = sub_split_dict.hasOwnProperty('subsplit');
      if (!has_children) {
        var name = 'split-' + this.model.get('split_machine_name');
        $(this.text_input).attr('name', name);
      }
      if (has_children) {
        var subsplit_holder_template = _.template($("#subsplit-holder-template").html(), {});
        var $subsplit_holder = $($.parseHTML(subsplit_holder_template.trim())).appendTo(this.el);
        var subsplit_list = sub_split_dict['subsplit'];
        for (var i = 0; i < subsplit_list.length; i++) {
          var split_level_definition = subsplit_list[i];
          var split_machine_name = split_level_definition['class'];
          var split_human_name = split_level_definition['name'];
          var sibling_split = parseFloat(split_level_definition['sibling_split']);

          var ssm = new SingleSliderModel({
            default_sibling_split: sibling_split,
            split_machine_name: split_machine_name,
            split_human_name: split_human_name,
            sibling_split: sibling_split,
            parent_obj_model: this.model
          });
          this.model.add_child(ssm);

          var single_slider_holder_template = _.template($('#single-slider-holder-template').html(), {
            'split_human_name': split_human_name,
            'has_children': split_level_definition.hasOwnProperty('subsplit')
          });
          var $single_slider_holder = $($.parseHTML(single_slider_holder_template.trim())).appendTo($subsplit_holder.find('.subsplit-wrapper'));
          new SingleSliderView({
            el: $single_slider_holder,
            model: ssm,
            sub_split_dict: split_level_definition
          });
        }
      }
      this.render()
    },
    events: {
      'mousedown .ui-slider': 'slider_moved',
      'slide': 'slider_moved',
      'slidestop': 'slider_moved',
      'change': 'amount_edited_directly',
      'click .disclosure-triangle': 'toggle_subsplit'
    },
    toggle_subsplit: function (event) {
      event.stopPropagation();
      var was_expanded = $(event.target).hasClass('subsplit-expanded');
      var subsplit = $(event.target).closest('.slider-container').first('.subsplit');
      var hider = subsplit.find('.subsplit-hider');
      if (!was_expanded) {
        hider.slideDown(200);
      } else {
        hider.slideUp(200)
      }
      $(event.target).toggleClass('subsplit-expanded');

    },
    amount_edited_directly: function (event) {
      event.stopPropagation();
      var raw_new_amount = $(this.text_input)[0].value;
      var new_amount = parseFloat(unmoneyformat(raw_new_amount));
      var new_amount_pennies = parseInt(Math.round(new_amount * 100));
      this.model.set({
        'amount_pennies': parseInt(new_amount_pennies)
      })
      this.model.propagate_amount_change_up()
    },
    slider_moved: function (e, ui) {
      e.stopPropagation();
      // this is the callback for when this slider is changed by a human
      if (ui == undefined) {
        // hack for safari sucking.
        var my_new_value = this.slider_div.slider('option', 'value');
      } else {
        var my_new_value = ui.value;
      }
      var my_new_percent = my_new_value / this.slider_increments;
      var sibling_percent_sum = 0;
      var my_siblings = this.model.get_siblings();
      for (var i = 0; i < my_siblings.length; i++) {
        sibling_percent_sum += my_siblings[i].get('sibling_split');
      }

      var parent_obj = this.model.get('parent_obj_model');
      var parent_amount_pennies = parent_obj.get('amount_pennies');

      // Calculate the splits for all the siblings.
      // Conceptually, we remove the active slider from the mix. Then we normalize the siblings to 1 to
      // determine their weights relative to each other. Then we divide the split that is left over from the moved
      // slider with these relative weights.
      for (var i = 0; i < my_siblings.length; i++) {
        var cur_sibling = my_siblings[i]
        var old_percent = cur_sibling.get('sibling_split');
        var this_siblings_percentage_of_non_active_siblings = 0;
        if (sibling_percent_sum === 0) {
          // if all the sliders except for the one being moved are at 0% we split the movement
          // evenly amongst them.
          this_siblings_percentage_of_non_active_siblings = 1.0 / my_siblings.length;
        } else {
          this_siblings_percentage_of_non_active_siblings = old_percent / sibling_percent_sum;
        }
        var new_sibling_split = (1.0 - my_new_percent) * this_siblings_percentage_of_non_active_siblings;
        var new_amount_pennies = new_sibling_split * parent_amount_pennies;
        cur_sibling.set({
          'amount_pennies': parseInt(new_amount_pennies),
          'sibling_split': new_sibling_split
        });
      }
      var pennies_amount = my_new_percent * parent_amount_pennies;

      this.model.set({
        'amount_pennies': parseInt(pennies_amount),
        'sibling_split': my_new_percent
      });
      this.render();
      parent_obj.distribute_pennies_down_one_level();
    },
    render: function () {
      // bound to be called when our model is updated, so we should update our sliders value
      $(this.slider_div).slider('value', this.slider_increments * this.model.get('sibling_split'));
      $(this.text_input).val(this.model.get_human_amount());

      var is_safari = ( navigator.userAgent.indexOf('Safari') > 0 && navigator.userAgent.indexOf('Chrome') == -1);

      if (is_safari){
        $('<style></style>').appendTo($(document.body)).remove();
      }
    }
  });

  window.HumbleSliders = Backbone.View.extend({
    defaults: {
      split_dict: null,
      text_input: null
    },
    events: {
      'change .master-amount': 'custom_amount_change',
    },
    initialize: function() {
      this.split_dict = this.get_option('split_dict', null);
      this.selected_split = 'default';
      this.default_dollar_price = this.get_option('default_dollar_price', 25);
      
      _.bindAll(this,
        'render',
        'get_option',
        'custom_amount_change',
        'validate_amount'
      ); // fixes loss of context for 'this' within methods

      this.model = new AmountModel({
        'amount_pennies': this.default_dollar_price * 100
      });
      this.model.on('change:amount_pennies', this.render);
      this.model.on('change:amount_pennies', this.validate_amount);

      var split_order_list = this.split_dict['order'];
      var first_split_name = split_order_list[0]['name'];
      var template_variables = {
        'first_split_name': first_split_name,
        'initial_value': this.model.get_human_amount(),
        'default_dollar_price': this.default_dollar_price,
      };
      var rendered_template = _.template($("#humble-sliders-template").html(), template_variables);
      $(this.el).html(rendered_template);

      this.text_input = $(this.el).find('.master-amount');
      for (var i = 0; i < split_order_list.length; i++) {
        var split_level_definition = split_order_list[i];
        var split_machine_name = split_level_definition['class'];
        var split_human_name = split_level_definition['name'];
        var sibling_split = 0;

        if (split_level_definition.hasOwnProperty('sibling_split')) {
          sibling_split = parseFloat(split_level_definition['sibling_split']);
        } else {
          // this is defined in the "default/all to charity/all to developers" portion of the split dict, called "split"
          sibling_split = parseFloat(this.split_dict['split']['default'][split_machine_name]);
        }
        var ssm = new SingleSliderModel({
          default_sibling_split: sibling_split,
          split_machine_name: split_machine_name,
          split_human_name: split_human_name,
          sibling_split: sibling_split,
          parent_obj_model: this.model
        });
        this.model.add_child(ssm);

        var single_slider_holder_template = _.template($('#single-slider-holder-template').html(), {
          'split_human_name': split_human_name,
          'has_children': split_level_definition.hasOwnProperty('subsplit')
        });
        var $single_slider_holder = $($.parseHTML(single_slider_holder_template.trim())).appendTo($(this.el).find('.splits-holder'));
        new SingleSliderView({
          el: $single_slider_holder,
          model: ssm,
          sub_split_dict: split_level_definition
        });
      }
      this.model.distribute_pennies_down_one_level();
      this.validate_amount();
    },
    get_option: function (option_name, fallback_value) {
      if (this.options.hasOwnProperty(option_name)) {
        return this.options[option_name];
      }
      return fallback_value;
    },
    custom_amount_change: function (event) {
      event.stopPropagation();
      var raw_new_amount = $(this.text_input)[0].value;
      // TODO add validation
      raw_new_amount = raw_new_amount.replace(',', '.');
      var new_amount = parseFloat(unmoneyformat(raw_new_amount));
      var new_amount_pennies = Math.round(new_amount * 100);
      this.model.set({
        'amount_pennies': parseInt(new_amount_pennies)
      })
    },
    validate_amount: function () {
      var fatal_error = false;
      var dollar_amount = this.model.get('amount_pennies') / 100.0;
      if (dollar_amount < .01) {
        //this.show_error_message('penny-error', 'Please enter at least one penny (preferably a lot more to help cover our costs!)')
        fatal_error = true
      } else {
        //this.hide_error_message('penny-error')
      }
      return fatal_error;
    },
    render: function () {
      // bound to be called when our model is updated
      $(this.text_input).val(this.model.get_human_amount());
      //$(this.el).find('.master-amount').fadeIn();
    }
  });

  // helper functions
  function unmoneyformat(dollaramount) {
    dollaramount = dollaramount.replace(/[^0-9.]/gi, ''); //strip non numbers and decimals
    var match = dollaramount.match(/((([0-9]+)?\.[0-9]+)|[0-9]+)/); //best guess at the number
    return match ? match[0] : 0.00
  }

  function merge_objects(obj1, obj2) {
    for (var attribute in obj2) {
      if (obj2.hasOwnProperty(attribute)) {
        obj1[attribute] = obj2[attribute];
      }
    }
    return obj1;
  }

  /*
   * JavaScript currency formatting
   * (from http://stackoverflow.com/questions/149055/how-can-i-format-numbers-as-money-in-javascript/149099#149099)
   */
  var formatMoney = function (n, c, d, t, z) {
      var s = ''; // die in a fire javascript
      var i = 0;
      var j = 0;
      z = z ? z : '';
      c = isNaN(c = Math.abs(c)) ? 2 : c, d = d == undefined ? ',' : d, t = t == undefined ? '.' : t, s = n < 0 ? '-' : '', i = parseInt(n = Math.abs(+n || 0).toFixed(c)) + '', j = (j = i.length) > 3 ? j % 3 : 0;
      return z + s + (j ? i.substr(0, j) + t : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, '$1' + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : '');
  };
  var moneyfmt = function(a) {
    return formatMoney(a,2,'.',',','$');
  };

  window.humbleSliders = function(default_dollar_price, container_el, splitsjson) {
    if (typeof HumbleSliders !== "undefined"){
      var humble_sliders = new HumbleSliders({
        el: container_el,
        default_dollar_price: default_dollar_price,
        split_dict: splitsjson,
      });
      return humble_sliders;
    }
  };

})(jQuery);

