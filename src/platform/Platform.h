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

    enum MessageType { Message_Status, Message_Error };

    Signal<const std::shared_ptr<Device>&>& onDeviceAdded();
    Signal<const std::shared_ptr<Device>&>& onDeviceRemoved();
    Signal<MessageType, const std::string&>& onMessage();

    typedef std::vector<std::shared_ptr<Action> > Actions;
    const Actions& actions() const;

protected:
    Platform(const Options& options);

    void addAction(std::shared_ptr<Action>&& action);
    void addDevice(const std::shared_ptr<Device>& device);
    void removeDevice(const std::shared_ptr<Device>& device);
    void removeDevice(const std::string& uniqueId);
    void sendMessage(MessageType type, const std::string& msg);
    void setValid(bool valid);

    std::mutex& mutex();

private:
    Signal<const std::shared_ptr<Device>&> mOnDeviceAdded, mOnDeviceRemoved;
    Signal<MessageType, const std::string&> mOnMessage;
    Actions mActions;
    std::mutex mMutex;
    std::unordered_map<std::string, std::shared_ptr<Device> > mDevices;
    bool mValid;
};

inline Platform::Platform(const Options&)
    : mValid(false)
{
}

inline Platform::~Platform()
{
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

#endif // PLATFORM
