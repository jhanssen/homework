#ifndef PLATFORM_H
#define PLATFORM_H

#include <Options.h>
#include <Device.h>
#include <Action.h>
#include <event/Loop.h>
#include <event/Signal.h>
#include <memory>
#include <mutex>
#include <unordered_map>

using reckoning::event::Signal;

class Platform : public std::enable_shared_from_this<Platform>
{
public:
    virtual ~Platform();

    bool isValid() const;

    typedef std::unordered_map<std::string, std::shared_ptr<Device> > Devices;

    enum MessageType { Message_Status, Message_Error };

    std::string name() const;
    Signal<const std::shared_ptr<Device>&>& onDeviceAdded();
    Signal<const std::shared_ptr<Device>&>& onDeviceRemoved();
    Signal<MessageType, const std::string&>& onMessage();

    typedef std::vector<std::shared_ptr<Action> > Actions;
    const Actions& actions() const;

    virtual bool start() = 0;
    virtual bool stop() { return true; }

    const Devices& devices() const;

protected:
    Platform(const std::string& name, const Options& options);

    void addAction(std::shared_ptr<Action>&& action);
    void addDevice(const std::shared_ptr<Device>& device);
    void removeDevice(const std::shared_ptr<Device>& device);
    void removeDevice(const std::string& uniqueId);
    void sendMessage(MessageType type, const std::string& msg);
    void setValid(bool valid);

    std::mutex& mutex();

    // device to platform
    virtual uint8_t deviceFeatures(const Device*/* device*/) const { return 0; }
    virtual bool setDeviceName(Device*/* device*/, const std::string& /*name*/) { return false; }

    // platform to device
    static void changeDeviceGroup(const std::shared_ptr<Device>& dev, const std::string& group);
    static void changeDeviceName(const std::shared_ptr<Device>& dev, const std::string& name);
    static void addDeviceAction(const std::shared_ptr<Device>& dev, std::shared_ptr<Action>&& action);

private:
    Signal<const std::shared_ptr<Device>&> mOnDeviceAdded, mOnDeviceRemoved;
    Signal<MessageType, const std::string&> mOnMessage;
    Actions mActions;
    std::mutex mMutex;
    Devices mDevices;
    std::string mName;
    bool mValid;

    friend class Device;
};

inline Platform::Platform(const std::string& name, const Options&)
    : mName(name), mValid(false)
{
}

inline Platform::~Platform()
{
}

inline std::string Platform::name() const
{
    return mName;
}

inline bool Platform::isValid() const
{
    return mValid;
}

inline void Platform::setValid(bool valid)
{
    mValid = valid;
}

inline std::mutex& Platform::mutex()
{
    return mMutex;
}

inline const Platform::Actions& Platform::actions() const
{
    return mActions;
}

inline void Platform::addAction(std::shared_ptr<Action>&& action)
{
    mActions.push_back(std::forward<std::shared_ptr<Action> >(action));
}

inline Signal<const std::shared_ptr<Device>&>& Platform::onDeviceAdded()
{
    return mOnDeviceAdded;
}

inline Signal<const std::shared_ptr<Device>&>& Platform::onDeviceRemoved()
{
    return mOnDeviceRemoved;
}

inline Signal<Platform::MessageType, const std::string&>& Platform::onMessage()
{
    return mOnMessage;
}

inline void Platform::addDevice(const std::shared_ptr<Device>& device)
{
    std::lock_guard<std::mutex> locker(mMutex);
    mDevices[device->uniqueId()] = device;
    mOnDeviceAdded.emit(device);
}

inline void Platform::removeDevice(const std::shared_ptr<Device>& device)
{
    std::lock_guard<std::mutex> locker(mMutex);
    mDevices.erase(device->uniqueId());
    mOnDeviceRemoved.emit(device);
}

inline void Platform::removeDevice(const std::string& uniqueId)
{
    std::lock_guard<std::mutex> locker(mMutex);
    auto device = mDevices.find(uniqueId);
    if (device != mDevices.end()) {
        auto ptr = device->second;
        mDevices.erase(device);
        mOnDeviceRemoved.emit(ptr);
    }
}

inline void Platform::sendMessage(MessageType type, const std::string& msg)
{
    mOnMessage.emit(MessageType(type), msg);
}

inline const Platform::Devices& Platform::devices() const
{
    return mDevices;
}

inline void Platform::changeDeviceGroup(const std::shared_ptr<Device>& dev, const std::string& group)
{
    dev->changeGroup(group);
}

inline void Platform::changeDeviceName(const std::shared_ptr<Device>& dev, const std::string& name)
{
    dev->changeName(name);
}

inline void Platform::addDeviceAction(const std::shared_ptr<Device>& dev, std::shared_ptr<Action>&& action)
{
    dev->addAction(std::forward<std::shared_ptr<Action> >(action));
}

#endif // PLATFORM
