#include "CecModule.h"
#include <libcec/cec.h>

using namespace CEC;

CecModule::CecModule()
    : mCecConfig(new libcec_configuration)
{
}

CecModule::~CecModule()
{
    delete mCecConfig;
}

void CecModule::initialize()
{
    mCecConfig->Clear();
    const Value cfg = configuration("cec");
}
