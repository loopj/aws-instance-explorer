class AwsInstanceChart {
  /**
   * Construct an AwsInstanceChart
   * @param el the parent element to populate the chart into
   */
  constructor(el) {
    // Settings object (for easy serialization to localStorage)
    this.settings = {
      // Instance filtering rules
      filterBy: {
        equals: [],
        notEquals: [],
        contains: [],
        notContains: [],
        set: [],
        notSet: []
      },

      // Instance grouping rules
      groupBy: null,

      // Instance coloring rules
      colorBy: null
    };

    // Instance node data
    this.instances = [];

    // Configure AWS SDK
    AWS.config.region = 'us-east-1';

    // Create a D3 force-directed graph layout
    this.force = d3.layout.force()
      .charge(-150)
      .on("tick", () => this.tick());

    // Create the SVG drawing canvas
    this.svg = d3.select(el).append("svg");

    // Create a color palette for nodes
    this.fill = d3.scale.category20();

    // Set size and allow window resizing
    this.resize(el);
    d3.select(window).on("resize", () => this.resize(el));
  }

  /**
   * Set the size of the chart based on the size of the parent element
   * @param el the parent element to populate the chart into
   */
  resize(el) {
    // Save new size
    this.width = el.offsetWidth;
    this.height = el.offsetHeight;

    // Size SVG canvas
    this.svg
      .attr("width", this.width)
      .attr("height", this.height);

    // Size force-directed graph layout
    this.force
      .size([this.width, this.height]).resume();
  }

  /**
   * Set which AWS credentials to use to fetch instance data
   * @param accessKeyId your AWS Access Key ID
   * @param secretAccessKey your AWS Secret Access Key
   */
  setCredentials(accessKeyId, secretAccessKey) {
    this.settings.accessKeyId = accessKeyId;
    this.settings.secretAccessKey = secretAccessKey;

    AWS.config.update({accessKeyId: accessKeyId, secretAccessKey: secretAccessKey});
  }

  /**
   * Get the node color which should be applied to this instance node
   * @param d the d3 datum
   */
  getInstanceColor(d) {
    return this.fill(this.findKey(this.settings.colorBy, d));
  }

  /**
   * Get the fill color which should be applied to this node
   * @param d the d3 datum
   */
  getNodeFill(d) {
    return d.children ? "#ffffff" : this.getInstanceColor(d);
  }

  /**
   * Get the stroke color which should be applied to this node
   * @param d the d3 datum
   */
  getNodeStroke(d) {
    return d.children ? "#555555" : d3.rgb(this.getInstanceColor(d)).darker(0.5);
  }

  /**
   * Get the radius which should be applied to this node
   * @param d the d3 datum
   */
  getNodeRadius(d) {
    var instanceTypes = [
      "nano", "micro", "small", "medium", "large", "xlarge",
      "2xlarge", "4xlarge", "8xlarge", "16xlarge", "32xlarge"
    ];

    return d.children ? 3 : Math.pow(instanceTypes.indexOf(d.instanceType.split(".")[1]), 1.4);
  }

  /**
   * Find a key in a (potentially) nested object
   * @example
   * // returns "db"
   * findKey({tags: {Role: "db"}, instanceType: "r3.large"}, "tags.Role")
   * // returns "r3.large"
   * findKey({tags: {Role: "db"}, instanceType: "r3.large"}, "instanceType")
   */
  findKey(key, obj) {
    try {
      return key.split(".").reduce((o, i) => o[i], obj);
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Given a set of filter rules, check if they all match using the given test function
   */
  matchesFilter(rules, obj, testFunc) {
    for(var i = 0; i < rules.length; i++) {
      var [key, expected] = rules[i];
      var actual = this.findKey(key, obj);

      if(!testFunc(actual, expected)) return false;
    }

    return true;
  }

  /**
   * Check if the given node matches all active filters
   */
  matchesAllFilters(node) {
    // Apply "equals" rules
    if(!this.matchesFilter(this.settings.filterBy.equals, node, (a, b) => a == b)) {
      return false;
    }

    // Apply "notEquals" rules
    if(!this.matchesFilter(this.settings.filterBy.notEquals, node, (a, b) => a != b)) {
      return false;
    }

    // Apply "contains" rules
    if(!this.matchesFilter(this.settings.filterBy.contains, node, (a, b) => !!a.match(new RegExp(b)))) {
      return false;
    }

    // Apply "notContains" rules
    if(!this.matchesFilter(this.settings.filterBy.notContains, node, (a, b) => !a.match(new RegExp(b)))) {
      return false;
    }

    // Apply "set" rules
    for(var i = 0; i < this.settings.filterBy.set.length; i++) {
      if(this.findKey(this.settings.filterBy.set[i], node) === undefined) return false;
    }

    // Apply "notSet" rules
    for(var i = 0; i < this.settings.filterBy.notSet.length; i++) {
      if(this.findKey(this.settings.filterBy.notSet[i], node) !== undefined) return false;
    }

    return true;
  }

  /**
   * Draw nodes after updating the data-set or filtering
   */
  drawNodes(nodes) {
    var nodeSelection = this.svg.selectAll(".node").data(nodes, d => d.id);

    // Create circle for each AWS instance - add to svg group
    nodeSelection
      .enter().append("circle")
        .attr("class", "node")
        .attr("r", d => this.getNodeRadius(d))
        .style("fill", d => this.getNodeFill(d))
        .style("stroke", d => this.getNodeStroke(d))
        .call(this.force.drag);

    // Remove orphaned node DOM elements
    nodeSelection.exit().remove();
  }

  /**
   * Draw node links after updating the data-set or filtering
   */
  drawLinks(links) {
    var linkSelection = this.svg.selectAll(".link").data(links, (d) => {
      return `${d.source.id}-${d.target.id}`;
    });

    // Create lines for each link
    linkSelection
      .enter().insert("line", ".node")
        .attr("class", "link");

    // Remove orphaned link DOM elements
    linkSelection.exit().remove();
  }

  /**
   * Update the node data used to generate the chart
   */
  update() {
    var instances = this.instances.filter(d => this.matchesAllFilters(d));
    var nodes = [];

    // Construct the root node
    var root = {
      id: "root",
      nodeType: "root",
      children: []
    };
    nodes.push(root);

    // Check if we should group nodes together
    if(this.settings.groupBy) {
      // Get a unique set of values for this group key
      var groupKeys = new Set();
      instances.forEach(instance => {
        groupKeys.add(this.findKey(this.settings.groupBy, instance));
      });

      // Construct each group node
      groupKeys.forEach(k => {
        var group = {
          id: k,
          nodeType: "group",
          children: []
        };
        nodes.push(group);
        root.children.push(group);

        // Add all matching instances to this group node
        instances.forEach(instance => {
          if(this.findKey(this.settings.groupBy, instance) == k) {
            nodes.push(instance);
            group.children.push(instance);
          }
        });
      });
    } else {
      // No grouping - just add all instances to root node
      instances.forEach(instance => {
        nodes.push(instance);
        root.children.push(instance);
      });
    }

    // Create links from the node tree
    var links = d3.layout.tree().links(nodes);

    // Draw nodes and links
    this.drawNodes(nodes);
    this.drawLinks(links);

    // Update force layout
    this.force
      .nodes(nodes)
      .links(links)
      .start();
  }

  /**
   * Update node positions
   */
  tick() {
    // Reposition nodes
    this.svg.selectAll(".node")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    // Reposition links
    this.svg.selectAll(".link")
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
  }

  /**
   * Load instance data into the chart
   */
  loadInstanceData() {
    // API request to list all EC2 instances
    new AWS.EC2().describeInstances({}, (err, resp) => {
      if(err) return;

      // Go through each instance
      for(var reservation of resp.Reservations) {
        for(var instance of reservation.Instances) {
          // Build a hash of tags (instead of ec2's array format)
          var tags = {}
          for(var tag of instance.Tags) {
            tags[tag.Key] = tag.Value;
          }

          // Add instance to internal list
          this.instances.push({
            id: instance.InstanceId,
            nodeType: "instance",
            instanceId: instance.InstanceId,
            instanceType: instance.InstanceType,
            tags: tags
          });
        }
      }

      // Update the chart with the new data
      this.update();
    });
  }
}
