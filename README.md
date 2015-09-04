# homework
Home automation system

## example rule
``` javascript
(function() {
    var cron = require("cron-parser");
    var interval = cron.parseExpression('*/30 * * * * *');
    homework.rule.alarm(interval.next());
    return function(args) {
        console.log(args);
        homework.rule.alarm(interval.next());
        return true;
    };
})();
```
