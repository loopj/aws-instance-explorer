document.addEventListener("DOMContentLoaded", () => {
    // Create instance chart
    let chart = window.chart = new AwsInstanceChart(document.getElementById("chart"));

    // Activate settings inputs
    let accessKeyIdInput = document.querySelector("input[name='accessKeyId']");
    let secretAccessKeyInput = document.querySelector("input[name='secretAccessKey']");
    [accessKeyIdInput, secretAccessKeyInput].forEach(input => {
        input.value = chart.settings[input.name];
        input.addEventListener("blur", () => {
            chart[input.name] = input.value;
        });
    });

    let groupSelect = document.querySelector("select[name='groupBy']");
    let colorSelect = document.querySelector("select[name='colorBy']");
    [groupSelect, colorSelect].forEach(input => {
        input.addEventListener("change", () => {
            chart[input.name] = input.selectedIndex ? input.options[input.selectedIndex].value : null;
        });
    });

    // Template function for instance nodes
    let instanceTemplate = (instance) => {
        var template = `
            <h2>Instance info</h2>
            <dl>
            <dt>Instance ID</dt>
            <dd>${instance.instanceId}</dd>

            <dt>Instance type</dt>
            <dd>${instance.instanceType}</dd>
            </dl>

            <h2>Tags</h2>
            <dl>`;

        // Sort tags for display
        let tagArray = Object.keys(instance.tags).map(key => [key, instance.tags[key]]);
        tagArray.sort((a, b) => a[0].localeCompare(b[0])).forEach(([tag, value]) => {
            template += `
                <dt>${tag}</dt>
                <dd>${value}</dd>`;
        });

        template += "</dl>";
        return template;
    };

    // Template function for group nodes
    let groupTemplate = (node) => {
        var template = `
            <h2>Group Info</h2>
            <dl>
            <dt>Group Name</dt>
            <dd>${node.id}</dd>

            <dt>Children</dt>
            <dd>${node.children.length}</dd>
            </dl>`;

        return template;
    };

    // Update info pane based on mouseover
    chart.handleMouseOver = (node) => {
        var template = node.nodeType == "instance" ? instanceTemplate : groupTemplate;
        document.getElementById("instance-info").innerHTML = template(node);
    };

    // Load instance data
    chart.loadInstanceData((err) => {
        if(err) return console.error(err);

        // Populate dropdowns with grouping options
        [groupSelect, colorSelect].forEach(input => {
            chart.getGroupKeys().forEach(k => {
                let option = document.createElement("option");
                option.text = k;
                option.value = k;
                option.selected = (k == chart.settings[input.name]);
                input.add(option);
            });
        });

        // Start with the root node selected
        chart.handleMouseOver(chart.rootNode);
    });
});
