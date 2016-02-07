# homework
Home automation system

## example config
```javascript
{
    "caseta": {
        "connection": {
            "host": "hostname",
            "port": 23,
            "login": "lutron",
            "password": "integration"
        },
        "devices": {
            "2": {
                "type": "dimmer",
                "name": "Lights",
                "room": "Hallway",
                "floor": "2nd floor"
            }
        }
    }
}
```
