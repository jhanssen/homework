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
    },
    "zwave": {
        "port": "/dev/ttyAMA0",
        "types": {
            "zwave:20": "fan",
            "zwave:14": "light"
        }
    },
    "location": {
        "latitude": 37.7833,
        "longitude": -122.4167
    }
}
```
